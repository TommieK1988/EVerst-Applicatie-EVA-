-- Houtrot-reparatiebibliotheek gaat op in de Recepten-bibliotheek, en
-- uurtarief/eenheden komen centraal uit Bedrijfsinstellingen.
-- Toegepast op 2026-07-21 via de Supabase MCP.
--
-- Keuzes (met Tom): marge blijft PER RECEPT bewaard, en de reparaties gaan van
-- het losse €65 naar het timmerman-tarief uit Bedrijfsinstellingen (€48). De
-- verkoopprijs beweegt daarin mee: gelijke marge op een lagere kostprijs.
-- Tom stemde daarmee in en gaat de recepten later finetunen op andere prijslijsten.

-- 1) Een recept krijgt een eigen marge; de verkoopprijs volgt daaruit, zodat een
--    tariefwijziging in Bedrijfsinstellingen automatisch doorwerkt.
alter table public.paint_items
  add column if not exists marge_pct numeric;

comment on column public.paint_items.marge_pct is
  'Marge in procenten van de verkoopprijs: verkoop = kostprijs / (1 - marge/100).';

-- 2) Een arbeidsnorm verwijst naar een uurtarief uit Bedrijfsinstellingen in
--    plaats van een los overgenomen bedrag. `hour_rate` blijft de doorgerekende
--    waarde, zodat bestaande berekeningen blijven werken.
alter table public.paint_labor_norms
  add column if not exists uurtarief_label text;

comment on column public.paint_labor_norms.uurtarief_label is
  'Verwijst naar bedrijfsinstellingen.uurtarieven[].label; hour_rate is de doorgerekende waarde.';

-- 3) Eenheden centraal in Bedrijfsinstellingen (stonden in de calculatie-instellingen).
alter table public.bedrijfsinstellingen
  add column if not exists eenheden jsonb not null default '[]'::jsonb;

update public.bedrijfsinstellingen b
set eenheden = coalesce(
      (select i.data->'eenheden' from public.everts_calc_instellingen i
       where i.id = 'singleton' and jsonb_typeof(i.data->'eenheden') = 'array'),
      '[{"afkorting":"m²"},{"afkorting":"m¹"},{"afkorting":"st"},{"afkorting":"uur"},
        {"afkorting":"dag"},{"afkorting":"m³"},{"afkorting":"ltr"},{"afkorting":"kg"},
        {"afkorting":"set"}]'::jsonb)
where b.id = 1 and (b.eenheden is null or jsonb_array_length(b.eenheden) = 0);

-- 4) Houtrot-reparaties overzetten naar recepten.
do $$
declare
  v_family   uuid;
  v_treat    uuid;
  v_tarief   numeric;
  r          record;
  v_item     uuid;
  v_mat_som  numeric;
  v_rest     numeric;
begin
  select (elem->>'tarief')::numeric into v_tarief
  from public.bedrijfsinstellingen b,
       lateral jsonb_array_elements(b.uurtarieven) elem
  where b.id = 1 and elem->>'label' ilike '%timmerman%'
  limit 1;
  v_tarief := coalesce(v_tarief, 48);

  select id into v_family from public.paint_system_families where family_code = 'HR';
  if v_family is null then
    insert into public.paint_system_families (family_code, name, source, active)
    values ('HR', 'Houtrotherstel', 'Houtrot-reparatiebibliotheek', true)
    returning id into v_family;
  end if;

  select id into v_treat from public.paint_treatments
  where family_id = v_family and treatment_code = 'HR-HERSTEL';
  if v_treat is null then
    insert into public.paint_treatments (family_id, treatment_index_code, treatment_code, name, source, active)
    values (v_family, 'HR-1', 'HR-HERSTEL', 'Houtrotherstel', 'Houtrot-reparatiebibliotheek', true)
    returning id into v_treat;
  end if;

  for r in select * from houtrotherstel.standard_repairs order by code loop
    select id into v_item from public.paint_items where item_code = r.code;
    if v_item is not null then continue; end if;

    insert into public.paint_items
      (family_id, treatment_id, item_code, onderdeel, type, full_name,
       default_unit, source, active, description, marge_pct)
    values
      (v_family, v_treat, r.code, r.name, coalesce(r.category, 'Houtrotherstel'), r.name,
       r.unit, 'Houtrot-reparatiebibliotheek', r.active, r.description, r.margin)
    returning id into v_item;

    insert into public.paint_labor_norms
      (item_id, treatment_id, source_code, unit, hours_per_unit, hour_rate,
       cost_per_unit, active, description, uurtarief_label)
    values
      (v_item, v_treat, r.code, r.unit, r.labor_hours, v_tarief,
       round(r.labor_hours * v_tarief, 2), true, 'Arbeid houtrotherstel', 'Arbeid timmerman');

    insert into public.paint_material_norms
      (item_id, treatment_id, source_code, material_code, material_name, unit,
       quantity_per_unit, unit_price, cost_per_unit, active, norm_type)
    select v_item, v_treat, r.code, null, m.material_name, m.unit,
           m.quantity, m.unit_cost, m.total_cost, true, 'materiaal'
    from houtrotherstel.standard_repair_materials m
    where m.standard_repair_id = r.id;

    -- De detailregels dekken de opgegeven materiaalkosten niet exact; sluitregel
    -- zodat de kostprijs van het recept gelijk blijft aan het origineel.
    select coalesce(sum(m.total_cost), 0) into v_mat_som
    from houtrotherstel.standard_repair_materials m
    where m.standard_repair_id = r.id;

    v_rest := coalesce(r.material_cost, 0) - v_mat_som;
    if v_rest <> 0 then
      insert into public.paint_material_norms
        (item_id, treatment_id, source_code, material_code, material_name, unit,
         quantity_per_unit, unit_price, cost_per_unit, active, norm_type)
      values
        (v_item, v_treat, r.code, null, 'Overig materiaal', r.unit,
         1, v_rest, v_rest, true, 'materiaal');
    end if;
  end loop;
end $$;

-- 5) Een registratie kiest voortaan een recept in plaats van een houtrot-reparatie.
--    De snapshot-kolommen blijven leidend voor de vastgelegde prijs.
alter table houtrotherstel.repair_registrations
  add column if not exists recept_id uuid references public.paint_items(id) on delete set null;

create index if not exists idx_htr_rr_recept_id
  on houtrotherstel.repair_registrations(recept_id);

comment on column houtrotherstel.repair_registrations.recept_id is
  'Recept uit de calculatiebibliotheek (public.paint_items). Vervangt standard_repair_id.';

-- 6) De demo-houtrotprojecten zijn overbodig sinds houtrot in het dossier zit.
--    Veilig: geen enkele registratie verwees ernaar.
delete from houtrotherstel.project_user_assignments;
delete from houtrotherstel.projects;
