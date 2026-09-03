-- Meerwerk: wie keurde goed of af, en wanneer.
-- Toegepast op 2026-09-02 via de Supabase MCP.
--
-- Tot nu toe legde EVA dat nergens vast. `updated_at` wordt door elke
-- veldwijziging overschreven en `created_by` werd bij het aanmaken niet eens
-- gevuld, dus achteraf viel niet te zeggen wie een regel op akkoord had gezet.
-- Bij meerwerk is dat juist de kern: het domeinproces eist schriftelijk
-- klantakkoord vóór uitvoering, en dan moet je kunnen laten zien wie dat gaf.
--
-- Eén set kolommen voor beide kanten. De vraag is dezelfde of het besluit nu van
-- een collega in EVA komt of van de opdrachtgever in het klantportaal, en met
-- twee aparte sets zou de helft van de schermen er altijd één vergeten.
alter table public.meerwerk_regels
  add column if not exists besluit_op         timestamptz,
  add column if not exists besluit_door_soort text,
  add column if not exists besluit_door_id    uuid,
  add column if not exists besluit_door_naam  text,
  add column if not exists besluit_ip         text,
  add column if not exists besluit_opmerking  text;

alter table public.meerwerk_regels
  drop constraint if exists meerwerk_regels_besluit_door_soort_check;
alter table public.meerwerk_regels
  add constraint meerwerk_regels_besluit_door_soort_check
  check (besluit_door_soort is null or besluit_door_soort in ('medewerker', 'klant'));

comment on column public.meerwerk_regels.besluit_op is
  'Moment waarop de regel op akkoord of afgewezen kwam te staan. Alleen die twee statussen vullen dit.';
comment on column public.meerwerk_regels.besluit_door_id is
  'medewerkers.id of portaal_gebruikers.id, afhankelijk van besluit_door_soort. Bewust geen foreign key: het besluit blijft leesbaar als het account later verdwijnt.';
comment on column public.meerwerk_regels.besluit_door_naam is
  'Naam op het moment van beslissen, bevroren. Een portaalaccount kan later aan een andere contactpersoon gekoppeld worden.';
comment on column public.meerwerk_regels.besluit_opmerking is
  'Toelichting van de besluitnemer zelf. NIET hetzelfde als afgewezen_reden: dat is de interne reden en die gaat het portaal niet in.';

-- ---------------------------------------------------------------------------
-- Meerwerk als portaalonderdeel
-- ---------------------------------------------------------------------------
-- Opt-in als al het andere: geen kolom op true zetten betekent dat de klant het
-- meerwerk van dit dossier niet ziet, laat staan kan beoordelen.
alter table public.portaal_dossier_instellingen
  add column if not exists toon_meerwerk boolean not null default false;

comment on column public.portaal_dossier_instellingen.toon_meerwerk is
  'Toont het meerwerk aan de klant. Regels met status offerte_verstuurd krijgen dan knoppen om goed te keuren of af te wijzen.';
