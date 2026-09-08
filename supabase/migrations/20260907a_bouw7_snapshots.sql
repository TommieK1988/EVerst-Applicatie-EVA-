-- Snapshots van Bouw7-leesdata.
--
-- WAAROM: EVA deed bij élk schermbezoek live Bouw7-calls. Eén Financieel-tab openen kostte er
-- vijftien, een Servicedesk-tab veertig, en niets werd gecachet — elke `router.refresh()` na een
-- mutatie deed ze allemaal opnieuw. Dat is de traagheid die gebruikers voelden.
--
-- Vanaf nu leest EVA interactief uitsluitend uit deze tabel. Gevuld wordt hij door de cron
-- (/api/cron/bouw7-snapshots, 2x per dag na de reguliere sync), door de knop "Vernieuwen uit
-- Bouw7" op een dossier, en door de betrokken schrijfacties zelf zodra die iets in Bouw7 wijzigen.
--
-- Eén rij per Bouw7-bron (endpoint), niet per scherm: dezelfde bron voedt meerdere tabs, dus zo
-- halen we hem één keer op in plaats van per tab opnieuw.
--
-- Sleutelvormen:
--   dossier:{dossier_uuid}:{soort}   per dossier, één rij per bron
--   uren:venster                     bedrijfsbrede urenregels (lopend jaar, minimaal 13 weken)
--   uren:periode:{van}:{tot}         losse periode die buiten het venster valt (op verzoek)
--   stam:{naam}                      stamdata voor schrijfacties (statussen, maatwerkvelden, ...)
create table if not exists public.bouw7_snapshots (
  sleutel        text primary key,
  -- Null voor globale snapshots (uren, stamdata). Verwijdert een dossier, dan gaan zijn
  -- snapshots mee -- ze hebben zonder dossier geen betekenis.
  dossier_id     uuid references public.dossiers(id) on delete cascade,
  soort          text not null,
  -- Ruwe Bouw7-respons; de verwerking blijft in de wrappers staan, zodat de rekenregels op
  -- één plek blijven en een snapshot ook na een codewijziging bruikbaar is.
  payload        jsonb,
  -- Tijdstip van de laatste GELUKTE ophaal; null zolang die er nooit was. Dit is wat de
  -- gebruiker als "Stand Bouw7: vandaag 07:02" te zien krijgt.
  opgehaald_op   timestamptz,
  duur_ms        integer,
  -- Laatste mislukte poging. De payload blijft dan staan: een oude stand tonen met de melding
  -- erbij is bruikbaarder dan een leeg scherm.
  fout           text,
  fout_op        timestamptz,
  aangemaakt_op  timestamptz not null default now()
);

-- De cron werkt de oudste snapshots het eerst bij en stopt als zijn tijdsbudget op is.
-- `nulls first` zet nooit-opgehaalde bronnen vooraan, zodat nieuwe dossiers niet achteraan sluiten.
create index if not exists bouw7_snapshots_oud_idx
  on public.bouw7_snapshots (soort, opgehaald_op asc nulls first);

create index if not exists bouw7_snapshots_dossier_idx
  on public.bouw7_snapshots (dossier_id, soort);

-- RLS aan zonder policy: alleen de service-role-client komt erbij. Dit is een cache van
-- Bouw7-data waar per dossier rechten op zitten; de wrappers doen die afscherming al.
alter table public.bouw7_snapshots enable row level security;
