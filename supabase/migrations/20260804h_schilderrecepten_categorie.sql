-- Schilderrecepten: categorie wordt Binnen- of Buitenschilderwerk
--
-- De spiegel zette `paint_items.onderdeel` — het categorieveld in de recepten-
-- bibliotheek — op de naam van het onderdeel ("Houten kozijn", "Betonlatei", …).
-- Daarmee kreeg de bibliotheek er in één klap 40 categorieën bij, terwijl een
-- categorie juist bedoeld is om grof te groeperen.
--
-- Alle gespiegelde schilderrecepten krijgen nu de toepassing als categorie:
-- Buitenschilderwerk of Binnenschilderwerk. Die staat al per behandeling in
-- `schilder_behandelingen.toepassing`, afgeleid uit het OnderhoudNL-bestek —
-- hoofdstuk 9 is buitenschilderwerk, hoofdstuk 10 binnen.
--
-- Het onderdeel zelf gaat niet verloren: dat staat in `full_name`
-- ("Houten kozijn, normaal profiel") en in `type`.

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
         b.id   as behandeling_id, b.naam as behandeling_naam, b.toepassing,
         b.korte_omschrijving, b.uitgebreide_werkomschrijving
    into v_c
    from public.schilder_combinaties k
    join public.schilder_onderdelen   o on o.id = k.onderdeel_id
    join public.schilder_types        t on t.id = k.type_id
    join public.schilder_behandelingen b on b.id = k.behandeling_id
   where k.id = p_combinatie_id;

  if not found then return; end if;

  v_treatment := public.spiegel_behandeling_naar_treatment(v_c.behandeling_id);
  v_volnaam   := v_c.onderdeel_naam || ', ' || v_c.type_naam;

  -- Behandelingen zonder toepassing (de handmatig aangemaakte pilotregels)
  -- vallen terug op de algemene categorie.
  v_categorie := case v_c.toepassing
                   when 'buiten' then 'Buitenschilderwerk'
                   when 'binnen' then 'Binnenschilderwerk'
                   else 'Schilderwerk'
                 end;

  insert into public.paint_items (
    family_id, treatment_id, item_code, onderdeel, type, full_name,
    default_unit, description, source, active, btw_tarief,
    schilder_combinatie_id, vergrendeld
  )
  values (
    v_familie_id, v_treatment,
    coalesce(v_c.bron_code, v_c.id::text),
    v_categorie, v_c.type_naam, v_volnaam, v_c.type_eenheid,
    coalesce(nullif(v_c.uitgebreide_werkomschrijving, ''), nullif(v_c.korte_omschrijving, '')),
    'Schilderwerkbibliotheek', v_c.actief, 'hoog', v_c.id, true
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

-- Alle bestaande spiegels opnieuw wegschrijven met de nieuwe categorie.
do $$
declare r record;
begin
  for r in select id from public.schilder_combinaties loop
    perform public.spiegel_schilder_naar_recept(r.id);
  end loop;
end $$;

-- De keuzelijst in de bibliotheek komt uit de instellingen; zonder deze regel
-- staan de nieuwe categorieën er wel op de recepten maar niet in het uitklapmenu.
update public.everts_calc_instellingen
   set data = jsonb_set(
         data,
         '{categorieen}',
         (
           select jsonb_agg(distinct waarde order by waarde)
             from jsonb_array_elements_text(
                    coalesce(data->'categorieen', '[]'::jsonb)
                    || '["Buitenschilderwerk","Binnenschilderwerk","Bouwplaats","Bereikbaarheid"]'::jsonb
                  ) as waarde
         )
       ),
       bijgewerkt_op = now()
 where id = 'singleton';
