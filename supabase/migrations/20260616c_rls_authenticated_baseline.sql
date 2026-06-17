-- RLS-basislijn: sluit de publieke anon-key buiten op alle blootgestelde tabellen.
--
-- Achtergrond (scan 16 juni 2026):
--   - Groep A: RLS aan, géén policy → sessie-client (authenticated) kreeg 0 rijen
--     (brak o.a. de rechten-flow). 38 tabellen.
--   - Groep B: RLS volledig uit → leesbaar/schrijfbaar met de publieke anon-key. ~44 tabellen.
--
-- De app benadert alle tabellen server-side (admin/service-role óf ingelogde sessie-client);
-- er zijn GEEN client-side table-reads via de browser (alleen storage-uploads + auth).
-- Daarom is de veilige, niet-brekende basislijn: RLS aan + één policy die uitsluitend de
-- rol `authenticated` toelaat. Gevolg:
--   - anon (publieke anon-key, niet ingelogd) → GEBLOKKEERD;
--   - authenticated (ingelogde Everts-gebruiker, server- of browser-sessie) → toegestaan;
--   - service_role (admin-client) → omzeilt RLS sowieso.
--
-- VERVOLG (least-privilege): dit is een basislijn, geen eindstation. Gevoelige tabellen
-- (relatie_bankgegevens, uren_regels, salaris in medewerkers, dossiers) horen op termijn
-- striktere policies te krijgen zodat bv. app-gebruikers (monteurs) niet alles kunnen lezen.
-- `medewerkers` heeft al een fijnmazige policy (self + platform) en blijft ongemoeid.

do $$
declare
  t text;
  tbls text[] := array[
    -- Groep A (RLS aan, geen policy)
    'actielijst_activeringen','actielijst_triggers','bedrijfsgegevens','contactpersonen',
    'contactpersoon_organisaties','dossier_status_historie','dossier_toggle_definities',
    'dossier_toggles','dossier_trigger_events','dossiers','form_bestanden','form_inzendingen',
    'form_rechten','form_taken','form_templates','form_versies','integraties',
    'medewerker_afwezigheid','medewerker_roosters','medewerker_skills','particulieren',
    'planning_activiteiten','planning_items','planning_uursoorten','planning_werkbegroting_regels',
    'relatie_bankgegevens','relatie_contacten','relatie_facturatie','relatie_factuuradressen',
    'relatie_inkoop','relatie_inkoop_kortingsafspraken','relatie_inkoop_prijsafspraken',
    'relatie_verkoop_prijsafspraken','sync_log','task_completion_acties','uren_regels',
    'werkbon_fotos','werkbonnen',
    -- Groep B (RLS uit) — m.u.v. medewerker_o365_tokens (apart, strakker)
    'algemene_voorwaarden','bedrijfsinstellingen','betalingscondities','calculation_groups',
    'calculation_lines','cao_documenten','cao_loonschalen','compliance_allowances',
    'compliance_bevindingen','compliance_feedback','formulier_pdf_config','gebruiker_layouts',
    'handboek_regels','lease_contracten','medewerker_afdelingen','medewerker_attribuut_definities',
    'medewerker_attribuut_waarden','medewerker_bedrijfsmiddelen','medewerker_bestanden',
    'medewerker_functies','medewerker_rooster_pauzes','paint_items','paint_labor_norms',
    'paint_material_norms','paint_measurement_aggregates','paint_measurement_lines',
    'paint_measurements','paint_system_families','paint_treatments',
    'planning_activiteit_afhankelijkheden','planning_fasen','projects','rdw_data',
    'schilder_arbeid_normen','schilder_behandelingen','schilder_combinaties',
    'schilder_materiaal_normen','schilder_onderdelen','schilder_types','sjabloonteksten',
    'ulu_imports','ulu_parking','ulu_trips','ulu_users','voertuig_bestuurders','voertuigen',
    'workflow_step_lists'
  ];
begin
  foreach t in array tbls loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists app_authenticated_all on public.%I', t);
    execute format(
      'create policy app_authenticated_all on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- OAuth-tokens: nooit client-/sessie-toegankelijk; uitsluitend de server (service-role).
-- RLS aan, geen policy → alleen de admin-client kan erbij.
alter table public.medewerker_o365_tokens enable row level security;
drop policy if exists app_authenticated_all on public.medewerker_o365_tokens;
