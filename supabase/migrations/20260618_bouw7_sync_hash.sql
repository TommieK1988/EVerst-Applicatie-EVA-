-- Incrementele (delta) Bouw7-sync: fingerprint-kolommen.
--
-- Per gesynchroniseerde entiteit bewaren we een stabiele hash van de brongegevens die de EVA-rij
-- bepalen. Bij een volgende sync wordt een record overgeslagen wanneer de nieuwe fingerprint gelijk
-- is aan de opgeslagen hash — zo vermijden we de dure per-record detail-calls en DB-writes voor
-- ongewijzigde dossiers/relaties/medewerkers.
--
-- bouw7_planning_hash op dossiers dekt de planning-sync (plan-items via Apollo) apart: planning kan
-- wijzigen zonder dat het project zelf wijzigt.

alter table dossiers        add column if not exists bouw7_sync_hash      text;
alter table dossiers        add column if not exists bouw7_planning_hash  text;
alter table relaties        add column if not exists bouw7_sync_hash      text;
alter table contactpersonen add column if not exists bouw7_sync_hash      text;
alter table medewerkers     add column if not exists bouw7_sync_hash      text;
