-- ============================================================================
-- Openstaande kwaliteitsronde-acties worden projectbezoeken.
--
-- Op verzoek van Tom: één knop, en dat is "Projectbezoek starten". De
-- kwaliteitsronde blijft bestaan als onderdeel binnen het bezoek — de projectleider
-- vinkt daar Kwaliteit aan en loopt dezelfde ronde, met dezelfde controlepunten.
--
-- Waarom dit een losse migratie is en niet in 20260907c zat: het is een
-- gegevensconversie op live acties, geen schemawijziging. Ze staat hier zodat de
-- omzetting terug te vinden is; ze is op 7 sep 2026 uitgevoerd op productie.
--
-- Getroffen: 38 acties, alle open (0 gereed of vervallen). Daarvan 36 herhalingen
-- uit de actielijst "Uitvoering - Standaard", 1 bron-/sjabloontaak en 1 losse actie.
-- Twee ervan hadden een lopende concept-inspectie.
--
-- Die twee raken hun werk NIET kwijt: `startInspectieVoorTaak` zoekt als eerste een
-- concept-inspectie op `task_id` en geeft die terug — dat gebeurt vóór de controle op
-- de vlaggen. De projectleider start het bezoek, vinkt Kwaliteit aan en komt in
-- precies dezelfde ronde terug.
--
-- De sjabloontaak gaat mee. Zonder dat zou de herhalings-sync in deadlines.ts de
-- omgezette herhalingen bij de eerstvolgende drain weer terugzetten op
-- kwaliteit_ronde — die synchroniseert de uitvoeracties immers vanaf het sjabloon.
--
-- Terugdraaien (mocht dat nodig zijn): keer de twee kolommen om voor de acties die
-- geen projectbezoek hebben gekregen.
--   update public.tasks set kwaliteit_ronde = true, bezoek_ronde = false
--    where bezoek_ronde
--      and not exists (select 1 from public.projectbezoeken b where b.task_id = tasks.id);
-- ============================================================================

update public.tasks
   set bezoek_ronde    = true,
       kwaliteit_ronde = false,
       updated_at      = now()
 where kwaliteit_ronde;
