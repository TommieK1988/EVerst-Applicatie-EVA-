-- Gespiegeld recept wijst naar zijn schilderbehandeling
--
-- Wie vanuit de calculatie een schilderrecept toevoegt, kreeg de werkomschrijving
-- als tekst in de regel gekopieerd. Dat is precies wat de behandeling-koppeling
-- moest voorkomen: een gekopieerde tekst veroudert zodra de bibliotheek wijzigt,
-- terwijl een gekoppelde behandeling live wordt opgehaald en pas bij het
-- verzenden van de offerte bevriest.
--
-- Daarvoor moet de calculatie weten wélke behandeling bij een recept hoort. Die
-- ligt vast in de combinatie, maar was vanaf `paint_items` niet bereikbaar zonder
-- extra query. Twee kolommen lossen dat op; de spiegel-trigger houdt ze bij.
--
-- `behandeling_code` is bewust gedenormaliseerd: de receptenzoeker gebruikt hem
-- om op "kozijn ohd 03" te kunnen zoeken, zonder per recept een lookup te doen.

alter table public.paint_items
  add column if not exists schilder_behandeling_id uuid
    references public.schilder_behandelingen(id) on delete set null,
  add column if not exists behandeling_code text;

comment on column public.paint_items.schilder_behandeling_id is
  'Behandeling waaraan een calculatieregel gekoppeld wordt bij het toevoegen van dit recept.';
comment on column public.paint_items.behandeling_code is
  'Code van die behandeling (bv. "OHD 03") — gedenormaliseerd voor de receptenzoeker.';

create index if not exists paint_items_schilder_behandeling_idx
  on public.paint_items (schilder_behandeling_id)
  where schilder_behandeling_id is not null;

-- ---------------------------------------------------------------------------
-- Spiegelfunctie: de twee nieuwe velden meenemen
-- ---------------------------------------------------------------------------

create or replace function public.spiegel_schilder_naar_recept(p_combinatie_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_familie_id uuid;
  v_c          record;
  v_treatment  uuid;
  v_item       uuid;
  v_volnaam    text;
  v_categorie  text;
begin
  select id into v_familie_id from public.paint_system_families where family_code = 'SCH';

  select k.id, k.bron_code, k.actief,
         o.naam as onderdeel_naam,
         t.naam as type_naam, t.eenheid as type_eenheid,
         b.id   as behandeling_id, b.naam as behandeling_naam, b.code as behandeling_code,
         b.toepassing, b.korte_omschrijving, b.uitgebreide_werkomschrijving
    into v_c
    from public.schilder_combinaties k
    join public.schilder_onderdelen   o on o.id = k.onderdeel_id
    join public.schilder_types        t on t.id = k.type_id
    join public.schilder_behandelingen b on b.id = k.behandeling_id
   where k.id = p_combinatie_id;

  if not found then return; end if;

  v_treatment := public.spiegel_behandeling_naar_treatment(v_c.behandeling_id);
  v_volnaam   := v_c.onderdeel_naam || ', ' || v_c.type_naam;

  v_categorie := case v_c.toepassing
                   when 'buiten' then 'Buitenschilderwerk'
                   when 'binnen' then 'Binnenschilderwerk'
                   else 'Schilderwerk'
                 end;

  insert into public.paint_items (
    family_id, treatment_id, item_code, onderdeel, type, full_name,
    default_unit, description, source, active, btw_tarief,
    schilder_combinatie_id, vergrendeld,
    schilder_behandeling_id, behandeling_code
  )
  values (
    v_familie_id, v_treatment,
    coalesce(v_c.bron_code, v_c.id::text),
    v_categorie, v_c.type_naam, v_volnaam, v_c.type_eenheid,
    coalesce(nullif(v_c.uitgebreide_werkomschrijving, ''), nullif(v_c.korte_omschrijving, '')),
    'Schilderwerkbibliotheek', v_c.actief, 'hoog', v_c.id, true,
    v_c.behandeling_id, v_c.behandeling_code
  )
  on conflict (schilder_combinatie_id) do update
    set treatment_id            = excluded.treatment_id,
        item_code               = excluded.item_code,
        onderdeel               = excluded.onderdeel,
        type                    = excluded.type,
        full_name               = excluded.full_name,
        default_unit            = excluded.default_unit,
        description             = excluded.description,
        active                  = excluded.active,
        vergrendeld             = true,
        schilder_behandeling_id = excluded.schilder_behandeling_id,
        behandeling_code        = excluded.behandeling_code
  returning id into v_item;

  delete from public.paint_labor_norms    where item_id = v_item;
  delete from public.paint_material_norms where item_id = v_item;

  insert into public.paint_labor_norms
    (item_id, treatment_id, source_code, unit, hours_per_unit, hour_rate,
     cost_per_unit, description, active, uurtarief_label)
  select v_item, v_treatment, coalesce(v_c.bron_code, v_c.id::text),
         coalesce(nullif(a.unit, ''), v_c.type_eenheid),
         round(a.minutes_per_unit / 60.0, 4),
         a.hour_rate, a.cost_per_unit, a.omschrijving, a.actief, a.uurtarief_label
    from public.schilder_arbeid_normen a
   where a.combinatie_id = v_c.id;

  insert into public.paint_material_norms
    (item_id, treatment_id, source_code, material_name, unit,
     quantity_per_unit, unit_price, cost_per_unit, active, norm_type)
  select v_item, v_treatment, coalesce(v_c.bron_code, v_c.id::text),
         coalesce(nullif(m.naam, ''), 'Materiaal'),
         m.eenheid, m.quantity_per_unit, m.unit_price, m.cost_per_unit,
         m.actief, m.norm_type
    from public.schilder_materiaal_normen m
   where m.combinatie_id = v_c.id;
end;
$$;

-- Alle bestaande spiegels bijwerken met de twee nieuwe velden.
do $$
declare r record;
begin
  for r in select id from public.schilder_combinaties loop
    perform public.spiegel_schilder_naar_recept(r.id);
  end loop;
end $$;
