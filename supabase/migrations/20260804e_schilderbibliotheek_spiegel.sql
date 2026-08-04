-- Schilderbibliotheek — spiegeling naar de recepten-bibliotheek
--
-- De schilderbibliotheek (`schilder_*`) is de bron. De recepten-bibliotheek
-- (`paint_*`) toont dezelfde normen als gewone recepten, zodat de receptenzoeker
-- in de calculatie ze vindt naast de VAC-verrekenprijzen en de houtrot-recepten.
--
-- Die kopie wordt door de database zelf bijgehouden, niet door de applicatie.
-- Reden: dan blijft de spiegel ook kloppen bij een import of een handmatige
-- SQL-wijziging die langs de server actions heen gaat. Gespiegelde recepten zijn
-- `vergrendeld` en worden in de recepten-UI alleen-lezen getoond.
--
-- Model-vertaling:
--   schilder_behandelingen   → paint_treatments   (familie 'SCH')
--   schilder_combinaties     → paint_items        (onderdeel + type = full_name)
--   schilder_arbeid_normen   → paint_labor_norms  (minuten → uren)
--   schilder_materiaal_normen→ paint_material_norms
--
-- LET OP: `schilder_arbeid_normen` rekent in MINUTEN per eenheid,
-- `paint_labor_norms` in UREN. De deling door 60 gebeurt hier, op één plek.

-- ---------------------------------------------------------------------------
-- Familie waar de gespiegelde recepten onder hangen
-- ---------------------------------------------------------------------------

insert into public.paint_system_families (id, family_code, name, source, active)
values (
  '00000000-0000-0000-0000-00000000005c',
  'SCH',
  'Schilderwerkbibliotheek',
  'Spiegel van de schilderbibliotheek',
  true
)
on conflict (family_code) do nothing;

-- ---------------------------------------------------------------------------
-- Behandeling → paint_treatments
-- ---------------------------------------------------------------------------

create or replace function public.spiegel_behandeling_naar_treatment(p_behandeling_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_familie_id uuid;
  v_beh        record;
  v_treatment  uuid;
begin
  select id into v_familie_id from public.paint_system_families where family_code = 'SCH';
  select * into v_beh from public.schilder_behandelingen where id = p_behandeling_id;
  if not found then return null; end if;

  -- `treatment_index_code` is samen met family_id uniek; de behandelingscode is
  -- daarvoor de natuurlijke sleutel. Behandelingen zonder code krijgen hun id.
  insert into public.paint_treatments
    (family_id, treatment_index_code, treatment_code, name, source, active)
  values (
    v_familie_id,
    coalesce(nullif(v_beh.code, ''), v_beh.id::text),
    coalesce(nullif(v_beh.code, ''), v_beh.id::text),
    v_beh.naam || coalesce(' — ' || nullif(v_beh.korte_omschrijving, ''), ''),
    coalesce(v_beh.bron, 'Schilderwerkbibliotheek'),
    v_beh.actief
  )
  on conflict (family_id, treatment_index_code) do update
    set name   = excluded.name,
        source = excluded.source,
        active = excluded.active
  returning id into v_treatment;

  return v_treatment;
end;
$$;

-- ---------------------------------------------------------------------------
-- Combinatie → paint_items + normen
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
begin
  select id into v_familie_id from public.paint_system_families where family_code = 'SCH';

  select k.id, k.bron_code, k.actief,
         o.naam as onderdeel_naam,
         t.naam as type_naam, t.eenheid as type_eenheid,
         b.id   as behandeling_id, b.naam as behandeling_naam,
         b.korte_omschrijving, b.uitgebreide_werkomschrijving
    into v_c
    from public.schilder_combinaties k
    join public.schilder_onderdelen   o on o.id = k.onderdeel_id
    join public.schilder_types        t on t.id = k.type_id
    join public.schilder_behandelingen b on b.id = k.behandeling_id
   where k.id = p_combinatie_id;

  -- Combinatie bestaat niet meer: de bijbehorende recepten zijn al via
  -- `on delete cascade` op schilder_combinatie_id opgeruimd.
  if not found then return; end if;

  v_treatment := public.spiegel_behandeling_naar_treatment(v_c.behandeling_id);
  v_volnaam   := v_c.onderdeel_naam || ', ' || v_c.type_naam;

  insert into public.paint_items (
    family_id, treatment_id, item_code, onderdeel, type, full_name,
    default_unit, description, source, active, btw_tarief,
    schilder_combinatie_id, vergrendeld
  )
  values (
    v_familie_id,
    v_treatment,
    coalesce(v_c.bron_code, v_c.id::text),
    v_c.onderdeel_naam,
    v_c.type_naam,
    v_volnaam,
    v_c.type_eenheid,
    coalesce(nullif(v_c.uitgebreide_werkomschrijving, ''), nullif(v_c.korte_omschrijving, '')),
    'Schilderwerkbibliotheek',
    v_c.actief,
    'hoog',
    v_c.id,
    true
  )
  on conflict (schilder_combinatie_id) do update
    set treatment_id = excluded.treatment_id,
        item_code    = excluded.item_code,
        onderdeel    = excluded.onderdeel,
        type         = excluded.type,
        full_name    = excluded.full_name,
        default_unit = excluded.default_unit,
        description  = excluded.description,
        active       = excluded.active,
        vergrendeld  = true
  returning id into v_item;

  -- Normen worden volledig herbouwd: dat houdt de spiegel gelijk aan de bron,
  -- ook als er in de bron een norm is verwijderd.
  delete from public.paint_labor_norms    where item_id = v_item;
  delete from public.paint_material_norms where item_id = v_item;

  insert into public.paint_labor_norms
    (item_id, treatment_id, source_code, unit, hours_per_unit, hour_rate,
     cost_per_unit, description, active, uurtarief_label)
  select v_item, v_treatment, coalesce(v_c.bron_code, v_c.id::text),
         coalesce(nullif(a.unit, ''), v_c.type_eenheid),
         round(a.minutes_per_unit / 60.0, 4),        -- minuten → uren
         a.hour_rate,
         a.cost_per_unit,
         a.omschrijving,
         a.actief,
         a.uurtarief_label
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

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create or replace function public.trg_spiegel_combinatie()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Bij DELETE ruimt de FK-cascade op schilder_combinatie_id het recept op.
  if tg_op = 'DELETE' then return old; end if;
  perform public.spiegel_schilder_naar_recept(new.id);
  return new;
end;
$$;

create or replace function public.trg_spiegel_norm()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.spiegel_schilder_naar_recept(
    case when tg_op = 'DELETE' then old.combinatie_id else new.combinatie_id end
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- Een gewijzigde behandeling raakt al haar combinaties: naam en werkomschrijving
-- staan in het gespiegelde recept.
create or replace function public.trg_spiegel_behandeling()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record;
begin
  perform public.spiegel_behandeling_naar_treatment(new.id);
  for r in select id from public.schilder_combinaties where behandeling_id = new.id loop
    perform public.spiegel_schilder_naar_recept(r.id);
  end loop;
  return new;
end;
$$;

drop trigger if exists spiegel_combinatie      on public.schilder_combinaties;
drop trigger if exists spiegel_arbeid_norm     on public.schilder_arbeid_normen;
drop trigger if exists spiegel_materiaal_norm  on public.schilder_materiaal_normen;
drop trigger if exists spiegel_behandeling     on public.schilder_behandelingen;

create trigger spiegel_combinatie
  after insert or update on public.schilder_combinaties
  for each row execute function public.trg_spiegel_combinatie();

create trigger spiegel_arbeid_norm
  after insert or update or delete on public.schilder_arbeid_normen
  for each row execute function public.trg_spiegel_norm();

create trigger spiegel_materiaal_norm
  after insert or update or delete on public.schilder_materiaal_normen
  for each row execute function public.trg_spiegel_norm();

create trigger spiegel_behandeling
  after insert or update on public.schilder_behandelingen
  for each row execute function public.trg_spiegel_behandeling();

-- ---------------------------------------------------------------------------
-- Bestaande combinaties eenmalig spiegelen
-- ---------------------------------------------------------------------------

do $$
declare r record;
begin
  for r in select id from public.schilder_combinaties loop
    perform public.spiegel_schilder_naar_recept(r.id);
  end loop;
end $$;
