-- "Wat is nieuw in EVA" — productchangelog / roadmap met afgeronde zaken.
--
-- Twee tabellen:
--   * changelog        — globaal; iedere ingelogde gebruiker leest gepubliceerde items.
--   * changelog_gezien — per gebruiker; timestamp van het laatste bezoek aan de pagina,
--                        zodat we het aantal "nieuwe sinds je laatste bezoek" kunnen tonen.
--
-- Content wordt gecureerd uit de commit-historie en als begrijpelijke, niet-technische
-- items geseed. Toekomstige items komen er via dezelfde seed/migratie-methode bij.

-- ── Tabel: changelog ────────────────────────────────────────────────
create table if not exists public.changelog (
  id            uuid primary key default gen_random_uuid(),
  datum         date not null,                       -- opleverdatum (groepering/sortering)
  titel         text not null,
  omschrijving  text not null,                       -- 1-3 zinnen, begrijpelijk
  categorie     text not null default 'nieuw'
                  check (categorie in ('nieuw','verbeterd','opgelost')),
  module        text,                                -- optionele tag (Offertes, Wagenpark, ...)
  gepubliceerd  boolean not null default true,
  aangemaakt_op timestamptz not null default now()   -- bepaalt "nieuw sinds laatste bezoek"
);

create index if not exists changelog_gepubliceerd_datum_idx
  on public.changelog(gepubliceerd, datum desc);

-- RLS: iedere ingelogde gebruiker leest gepubliceerde items; muteren alleen via
-- service-role (seed/migratie), conform het security-model.
alter table public.changelog enable row level security;

create policy "changelog_lezen"
  on public.changelog
  for select
  to authenticated
  using (gepubliceerd = true);

-- ── Tabel: changelog_gezien ─────────────────────────────────────────
create table if not exists public.changelog_gezien (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  gezien_op timestamptz not null default now()
);

alter table public.changelog_gezien enable row level security;

create policy "eigen_changelog_gezien"
  on public.changelog_gezien
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ── Seed: gecureerde items uit de ontwikkelhistorie (juni–juli 2026) ─
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-07-14','verbeterd','Dossiers','Bouw7-aantekeningen komen automatisch in het dossier',
    'Herinneringen, notities en to-do''s uit Bouw7 verschijnen nu automatisch als notitie of taak in het bijbehorende dossier, zodat je alles op één plek bij elkaar hebt.'),
  ('2026-07-14','verbeterd','Dossiers','Filter op niet-toegewezen dossiers',
    'Naast de personen-filters kun je nu in één klik alle dossiers tonen die nog aan niemand zijn toegewezen.'),
  ('2026-07-14','verbeterd','Formulieren','Nettere PDF-opmaak voor formulieren',
    'Ingevulde formulieren worden nu als een strak document opgemaakt en passen netjes binnen het briefpapier.'),
  ('2026-07-13','nieuw','Wagenpark','Privacy-afscherming voor ritregistratie',
    'Ritten en werktijden zijn nu privacy-vriendelijk afgeschermd: wie er geen inzage in hoeft te hebben, ziet alleen de zakelijke ritten. Bij afwijkende werktijden volgt een melding.'),
  ('2026-07-13','nieuw','Meldingen','Meldingen verschijnen automatisch in beeld',
    'Nieuwe meldingen ploppen rechtsboven op met een duidelijke opmaak: wat er gebeurd is, om welk dossier het gaat en wanneer.'),
  ('2026-07-13','nieuw','Calculatie','Calculaties importeren uit .c4y-bestanden',
    'Je kunt nu naast CUF ook .c4y-bestanden rechtstreeks in het calculatiescherm inlezen.'),
  ('2026-07-13','verbeterd','Formulieren','Sterrenwaardering en pagina-indeling in formulieren',
    'Formulieren ondersteunen nu een sterren-waardering, handmatige pagina-einden en een eigen opmaak per sjabloon.'),
  ('2026-07-13','nieuw','Offertes','Verzonden offertes belanden automatisch in Bouw7',
    'Zodra je een offerte verstuurt, wordt die automatisch als offerte in Bouw7 vastgelegd.'),
  ('2026-07-13','nieuw','Offertes','Calculatie en offerte als één versiepaar',
    'Elke offerte hangt vast aan een bevroren calculatieversie. Reviseren maakt netjes een nieuwe versie zonder de oude te verliezen.'),
  ('2026-07-13','verbeterd','Offertes','Voorwaarden en opmerkingen per calculatie',
    'Voorwaarden, uitsluitingen en opmerkingen stel je nu per calculatie in, met de mogelijkheid ze uit een standaardsjabloon te laden.'),
  ('2026-07-09','verbeterd','Offertes','Foto''s bij de werkomschrijving in de offerte',
    'Foto''s uit de werkomschrijving worden meegenomen naar de offerte, met behoud van de juiste verhouding.'),
  ('2026-07-09','verbeterd','Offertes','Offertestatus vereenvoudigd naar concept en definitief',
    'De offertestatus is teruggebracht tot twee heldere waarden: concept en definitief (verzonden).'),
  ('2026-07-09','verbeterd','Offertes','Meer variabelen in offerteteksten',
    'Contactpersoon, aanspreekvorm, termijnschema en betalingstermijn zijn nu als variabele beschikbaar in offerteteksten.'),
  ('2026-07-08','nieuw','Oplevering','Nieuwe module: Oplevering',
    'Rond projecten af met opleverpunten, digitale akkoordportalen voor onderaannemer, opdrachtgever en bewoner, en een opleverrapportage.'),
  ('2026-07-08','opgelost','Werkbegroting','Werkbegroting overal actueel',
    'De werkbegroting wordt centraal bewaard, zodat je op elk apparaat dezelfde, actuele versie ziet.'),
  ('2026-07-08','opgelost','Calculatie','Calculaties overal actueel',
    'Ook calculaties, prognose-instellingen en concepten worden centraal bewaard en zijn op elk apparaat gelijk.'),
  ('2026-07-08','nieuw','Beveiliging','Automatisch uitloggen bij inactiviteit',
    'Na 15 minuten zonder activiteit word je automatisch uitgelogd.'),
  ('2026-07-07','nieuw','Offertes','Offertes volledig binnen het dossier',
    'De hele offerte-flow — opstellen, preview en versturen — gebeurt nu in het dossier zelf, zonder omweg via EvertsCalc.'),
  ('2026-07-07','nieuw','Offertes','Offertes mailen via Outlook',
    'Verstuur offertes rechtstreeks via Outlook, met automatische archivering in SharePoint en een statusupdate naar verzonden.'),
  ('2026-07-07','verbeterd','Offertes','Echte PDF-preview met CONCEPT-watermerk',
    'Bekijk een offerte vooraf als echte PDF met een duidelijk CONCEPT-watermerk voordat je hem verstuurt.'),
  ('2026-07-07','verbeterd','Offertes','Geneste hoofdstukken met opgetelde totalen',
    'De offerte-opmaak ondersteunt een geneste structuur waarbij totalen per hoofdstuk automatisch worden opgeteld.'),
  ('2026-07-07','verbeterd','Calculatie','Persoonlijke kolomindeling en schilderbehandeling-bibliotheek',
    'Bewaar je eigen kolomindeling in het calculatiescherm en kies schilderbehandelingen uit de bibliotheek.'),
  ('2026-07-07','verbeterd','Dossiers','Rollen en werkadres in het dossier bewerkbaar',
    'Projectrollen en het werkadres pas je aan op de informatietab; wijzigingen worden teruggeschreven naar Bouw7.'),
  ('2026-07-07','opgelost','Planning','Nauwkeurigere planningssynchronisatie',
    'Einddatums en werktijden uit Bouw7 komen nu op de juiste dag en tijd in de planning terecht.'),
  ('2026-07-06','nieuw','Dossiers','Nieuw tabblad: Afgesloten dossiers',
    'Afgeronde, verloren en vervallen dossiers staan in een eigen, compacte opzoektabel. Ze zijn alleen-lezen zodat er niets meer per ongeluk wijzigt.'),
  ('2026-07-06','verbeterd','Dossiers','Uitgebreide lijstweergave met kolomkeuze',
    'De lijstweergave van dossiers heeft tientallen kolommen die je zelf aan- en uitzet.'),
  ('2026-07-06','verbeterd','Algemeen','Titelbalk en handleiding op elke pagina',
    'Elke pagina heeft nu een duidelijke titel en een ?-knop met uitleg over wat je er kunt doen.'),
  ('2026-07-06','verbeterd','Beveiliging','Beveiliging flink aangescherpt',
    'De toegang tot gevoelige gegevens — persoonsgegevens, HR en financiën — is strak dichtgezet.'),
  ('2026-07-06','nieuw','Dossiers','SharePoint-bestanden in de Bestanden-tab',
    'Naast de Bouw7-bestanden zie je nu ook de gekoppelde SharePoint-map van het dossier.'),
  ('2026-07-05','nieuw','Offertes','Offerte-opmaakeditor met briefpapier en preview',
    'Stel de opmaak van je offertes in met eigen briefpapier, variabelen en een directe preview.'),
  ('2026-07-03','nieuw','Meerwerk','Meerwerk vastleggen op de opdracht',
    'Registreer meer- en minderwerk op een opdracht met status en akkoord, en schrijf goedgekeurd meerwerk door naar Bouw7.'),
  ('2026-07-03','nieuw','Dossiers','Bestanden-tab met documenten uit Bouw7',
    'Elk dossier heeft een Bestanden-tab die de documenten uit Bouw7 toont en downloadbaar maakt.'),
  ('2026-07-03','nieuw','Financieel','Goedkeuringsworkflow voor offerte en werkbegroting',
    'Offertes en werkbegrotingen kunnen een controle- of directie-akkoord vereisen voordat ze verzonden of besteld worden.'),
  ('2026-07-03','verbeterd','Medewerkers','Uitgebreide medewerkerskaart',
    'Alle velden zichtbaar als kolom, koppeling met de wagenpark-bestuurder en een overzicht van verlof.'),
  ('2026-07-03','verbeterd','Algemeen','Gerichte synchronisatieknoppen per scherm',
    'Elke pagina heeft een sync-knop die alleen de eigen sectie ververst; de volledige sync draait automatisch.'),
  ('2026-07-02','nieuw','Management','Werkvoorraad in Management',
    'Zie de nog uit te voeren arbeidsuren afgezet tegen de beschikbare capaciteit per uursoort.'),
  ('2026-07-01','verbeterd','Financieel','Voortgang per bewakingscode',
    'Het percentage gereed wordt berekend per bewakingscode en teruggeschreven naar Bouw7.'),
  ('2026-06-30','nieuw','Inkoop','Inkoopkosten corrigeren in EVA',
    'Geboekte kosten bekijk en corrigeer je in een filterbare tabel, zonder dat Bouw7 zelf wijzigt.'),
  ('2026-06-30','nieuw','Financieel','Financieel-tab per bewakingscode',
    'Een financieel overzicht per bewakingscode met prognose, nog te verwachten kosten en geboekte uren.'),
  ('2026-06-29','nieuw','Servicedesk','Servicedesk: regie en aangenomen werk',
    'De servicedesk maakt onderscheid tussen regie en aangenomen werk, met mandaat, doorlooptijd en een samengevoegd financieel overzicht.'),
  ('2026-06-25','verbeterd','Planning','Vernieuwde planning met uniforme tijdlijn',
    'Project- en medewerkerplanning delen één tijdlijn-opmaak met dag-zoom en scrubber.'),
  ('2026-06-23','nieuw','Financieel','Nieuw: Facturen en debiteurenbeheer',
    'Bekijk openstaande verkoopfacturen uit Bouw7 met een verkeerslicht, opvolging en automatische taken bij late betaling.'),
  ('2026-06-23','nieuw','Calculatie','Materialenbibliotheek met leverancierskoppeling',
    'Beheer materiaalgroepen, merken en leverancier-prijzen, met import vanuit DICO.'),
  ('2026-06-23','nieuw','KAM','KAM/VGM: opdrachten met VCA',
    'Een overzicht van alle opdrachten met VCA bovenaan de KAM-pagina.'),
  ('2026-06-23','nieuw','Taken','Actielijsten met automatische triggers',
    'Koppel actielijst-sjablonen automatisch aan dossiers op basis van gebeurtenissen en voorwaarden.'),
  ('2026-06-22','nieuw','Algemeen','Snelzoeker en Vraag EVA',
    'Zoek razendsnel door dossiers, klanten en adressen, of stel EVA een vraag in gewoon Nederlands.'),
  ('2026-06-22','nieuw','Algemeen','Automatische Bouw7-synchronisatie',
    'De koppeling met Bouw7 synchroniseert nu automatisch twee keer per dag.'),
  ('2026-06-22','nieuw','Management','Management-dashboard',
    'KPI''s, marges en funnel per werkmaatschappij en projectleider, inclusief onderhanden werk.'),
  ('2026-06-22','nieuw','Taken','Persoonlijk takenoverzicht Mijn taken',
    'Een eigen overzicht van alle openstaande taken die aan jou zijn toegewezen, gesorteerd op deadline.'),
  ('2026-06-18','nieuw','Mobiel','Mobiele omgeving voor buitendienst',
    'Een aparte mobiele ingang met taken, dossiers en het invullen van formulieren op de telefoon.'),
  ('2026-06-16','nieuw','Werkbegroting','Werkbegroting-prognose per bewakingscode',
    'Stel de prognose per bewakingscode op en push die als prognose naar Bouw7.'),
  ('2026-06-16','nieuw','Beveiliging','Rechten per module afgedwongen',
    'De toegang tot modules volgt nu de ingestelde rechten per medewerker.'),
  ('2026-06-10','nieuw','Beveiliging','Inloggen met Office 365',
    'Log in met je Microsoft-account via Office 365.'),
  ('2026-06-10','nieuw','Algemeen','EVA-platform gelanceerd',
    'De eerste versie van EVA: het centrale platform waarin alle modules — dossiers, calculatie, wagenpark, taken en meer — samenkomen.');
