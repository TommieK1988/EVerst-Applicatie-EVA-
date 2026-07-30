-- Houtrotregistraties archiveren.
--
-- Een registratie die niet klopt (dubbel opgenomen, verkeerd dossier, proefinvoer)
-- moet uit de overzichten en vooral uit de rapportage kunnen verdwijnen zónder de
-- historie weg te gooien. Archiveren is daarom een vlag, geen verwijdering:
-- `gearchiveerd_op` gevuld = onzichtbaar in de dossier-tab, de rapportage-picker en
-- het Word-rapport, maar terug te zetten.
--
-- Definitief verwijderen blijft ook mogelijk (regels en fotorijen vallen om via de
-- bestaande ON DELETE CASCADE); daar is geen schemawijziging voor nodig.
--
-- Toegepast op productie via de Supabase MCP op 2026-07-30.

alter table houtrotherstel.repair_registrations
  add column if not exists gearchiveerd_op timestamptz,
  add column if not exists gearchiveerd_door uuid;

comment on column houtrotherstel.repair_registrations.gearchiveerd_op is
  'Gevuld = gearchiveerd: telt niet mee in overzichten, totalen en rapportages. Leeg = actief.';
comment on column houtrotherstel.repair_registrations.gearchiveerd_door is
  'Medewerker (public.medewerkers.id) die archiveerde. Geen FK: cross-schema, zelfde keuze als user_id.';

-- De standaardvraag is "actieve registraties van dit dossier"; die filtert altijd
-- op beide kolommen.
create index if not exists repair_registrations_dossier_actief_idx
  on houtrotherstel.repair_registrations (dossier_id)
  where gearchiveerd_op is null;
