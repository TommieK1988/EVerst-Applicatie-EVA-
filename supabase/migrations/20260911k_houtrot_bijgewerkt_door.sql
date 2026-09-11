-- Wie heeft deze houtrotregistratie voor het laatst bewerkt?
--
-- De registratie legde alleen de maker vast (`user_id`) en het moment van de
-- laatste wijziging (`updated_at`, via trigger). Wie die wijziging deed was
-- nergens te zien — terwijl een registratie in het veld wordt aangemaakt en op
-- kantoor vaak nog wordt bijgesteld. `bijgewerkt_door` blijft leeg zolang een
-- registratie niet is bewerkt; dan is de maker ook de laatste bewerker.
--
-- Toegepast op productie via de Supabase MCP op 2026-09-11.
alter table houtrotherstel.repair_registrations
  add column if not exists bijgewerkt_door uuid references public.medewerkers(id) on delete set null;

-- De houtrot-browserclient is op het `houtrotherstel`-schema gescoped en kan niet
-- naar `public.medewerkers` embedden; namen komen daarom uit deze view.
create or replace view houtrotherstel.registraties_met_details as
 SELECT rr.id,
    rr.project_id,
    rr.user_id,
    rr.registration_date,
    rr.location_block,
    rr.floor,
    rr.room_or_unit,
    rr.facade_side,
    rr.component_type,
    rr.element_number,
    rr.damage_description,
    rr.damage_severity,
    rr.damage_cause,
    rr.standard_repair_id,
    rr.custom_work_description,
    rr.notes,
    rr.status,
    rr.control_status,
    rr.completed_at,
    rr.checked_at,
    rr.labor_hours_snapshot,
    rr.labor_rate_snapshot,
    rr.labor_cost_snapshot,
    rr.material_cost_snapshot,
    rr.cost_price_snapshot,
    rr.sale_price_snapshot,
    rr.repair_code_snapshot,
    rr.repair_name_snapshot,
    rr.repair_description_snapshot,
    rr.actual_labor_hours,
    rr.actual_material_cost,
    rr.actual_cost_price,
    rr.actual_sale_price,
    rr.created_at,
    rr.updated_at,
    p.name AS project_name,
    p.project_number,
    p.client_name,
    NULLIF(TRIM(BOTH FROM concat_ws(' '::text, m.voornaam, m.tussenvoegsel, m.achternaam)), ''::text) AS medewerker_naam,
    m.email AS medewerker_email,
    sr.name AS standaard_reparatie_naam,
    sr.category AS reparatie_categorie,
    COALESCE(rr.actual_sale_price, rr.sale_price_snapshot) AS effectieve_verkoopprijs,
    COALESCE(rr.actual_cost_price, rr.cost_price_snapshot) AS effectieve_kostprijs,
    COALESCE(rr.actual_labor_hours, rr.labor_hours_snapshot) AS effectieve_arbeidsuren,
    rr.bijgewerkt_door,
    NULLIF(TRIM(BOTH FROM concat_ws(' '::text, b.voornaam, b.tussenvoegsel, b.achternaam)), ''::text) AS bijgewerkt_door_naam
   FROM ((((houtrotherstel.repair_registrations rr
     LEFT JOIN houtrotherstel.projects p ON ((rr.project_id = p.id)))
     LEFT JOIN medewerkers m ON ((rr.user_id = m.id)))
     LEFT JOIN medewerkers b ON ((rr.bijgewerkt_door = b.id)))
     LEFT JOIN houtrotherstel.standard_repairs sr ON ((rr.standard_repair_id = sr.id)));

grant select on houtrotherstel.registraties_met_details to anon, authenticated, service_role;

notify pgrst, 'reload schema';
