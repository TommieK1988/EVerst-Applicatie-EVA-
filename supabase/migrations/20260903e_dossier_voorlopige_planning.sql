-- Voorlopige planning op het dossier — een indicatieve start- en einddatum.
--
-- Waarom nieuwe kolommen en geen hergebruik van verwacht_startdatum/verwacht_einddatum:
-- die twee worden bij elke Bouw7-sync overschreven met project.startDate/endDate
-- (lib/bouw7/sync.ts). Wat een medewerker hier invult zou dus stilzwijgend verdwijnen.
-- Deze twee zijn EVA-eigen en worden door geen enkele sync aangeraakt.
--
-- Ook géén hergebruik van de planning zelf: planning_items ontstaan pas als het werk
-- daadwerkelijk wordt ingepland. De voorlopige planning is juist de afspraak die je
-- vóór dat moment met de opdrachtgever maakt en in de opdrachtbevestiging zet.
--
-- Type date, niet timestamptz: dit is een kalenderafspraak zonder tijdstip.
-- nlKalenderdatum() in lib/dossiers/datum-regels.ts laat kale YYYY-MM-DD bewust
-- ongemoeid, dus deze datums kunnen niet over een tijdzonegrens verschuiven.

alter table public.dossiers
  add column if not exists voorlopige_start date,
  add column if not exists voorlopige_eind  date;

comment on column public.dossiers.voorlopige_start is
  'Voorlopige (indicatieve) startdatum van de uitvoering. Handmatig, EVA-eigen; wordt niet door de Bouw7-sync overschreven. Los van verwacht_startdatum en van planning_items.';
comment on column public.dossiers.voorlopige_eind is
  'Voorlopige (indicatieve) einddatum van de uitvoering. Zie voorlopige_start.';

-- Vangnet. De echte melding komt uit de clientvalidatie in InformatieTab.opslaan();
-- deze constraint vangt alleen wat daaromheen zou glippen (import, script, API).
alter table public.dossiers drop constraint if exists dossiers_voorlopige_periode_chk;
alter table public.dossiers add constraint dossiers_voorlopige_periode_chk
  check (
    voorlopige_start is null
    or voorlopige_eind is null
    or voorlopige_eind >= voorlopige_start
  );
