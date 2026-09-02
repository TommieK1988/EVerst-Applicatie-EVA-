-- Klantportaal — fundament.
-- Toegepast op 2026-09-02 via de Supabase MCP.
--
-- Opdrachtgevers krijgen een eigen inlog op /portaal met hun dossiers. Alles is
-- opt-in: een dossier staat pas in het portaal als het hier aangezet is, en per
-- onderdeel én per bestand wordt apart aangevinkt wat de klant ziet. Een
-- klantportaal faalt niet als het te weinig toont, maar wel als het te veel toont.
--
-- RLS: elke tabel hieronder is dicht voor iedereen behalve platformgebruikers
-- (medewerkers). De klant leest zijn eigen gegevens NOOIT via RLS — dat loopt
-- volledig via de service-role-client achter de guards in lib/portaal/auth.ts,
-- precies zoals het tokenportaal onder /p/ dat doet. is_platform_gebruiker()
-- verruimen zou de riskantste wijziging in deze database zijn; dat gebeurt hier
-- dus niet. Gevolg: een ingelogde klant die per ongeluk de anon-client raakt,
-- krijgt overal nul rijen. Dat is de bedoelde bodem.

-- ---------------------------------------------------------------------------
-- Wie mag er in het portaal
-- ---------------------------------------------------------------------------
-- Eigen tabel, geen auth_user_id op contactpersonen: die tabel wordt uit Bouw7
-- gesynchroniseerd (sync_hash, sync_vergrendeld), portaaltoegang heeft een eigen
-- levenscyclus (uitnodigen, blokkeren, laatst ingelogd), en particulieren zijn
-- een tweede klantentiteit die dezelfde toegang nodig heeft.
create table if not exists public.portaal_gebruikers (
  id                 uuid primary key default gen_random_uuid(),
  -- Gevuld bij de eerste geslaagde magic-link-login; daarvóór bestaat het
  -- auth-account nog niet en is e-mail de enige sleutel.
  auth_user_id       uuid unique,
  email              text not null,
  contactpersoon_id  uuid references public.contactpersonen(id) on delete set null,
  particulier_id     uuid references public.particulieren(id)   on delete set null,
  -- De organisatie waar deze persoon namens optreedt. Bepaalt bij scope
  -- 'organisatie' welke dossiers zichtbaar zijn.
  relatie_id         uuid references public.relaties(id) on delete cascade,
  scope              text not null default 'eigen_dossiers'
                       check (scope in ('eigen_dossiers','organisatie')),
  actief             boolean not null default true,
  uitgenodigd_op     timestamptz,
  uitgenodigd_door   uuid references public.medewerkers(id) on delete set null,
  -- Rem op het opnieuw aanvragen van een inloglink.
  laatste_link_op    timestamptz,
  laatst_ingelogd_op timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint portaal_gebruikers_persoon
    check (contactpersoon_id is not null or particulier_id is not null)
);

-- Login zoekt op e-mail; hoofdletters mogen daarbij niet uitmaken en één adres
-- mag nooit twee portaalaccounts hebben.
create unique index if not exists portaal_gebruikers_email_uniek
  on public.portaal_gebruikers (lower(email));
create index if not exists portaal_gebruikers_relatie_idx
  on public.portaal_gebruikers (relatie_id) where actief;

comment on table public.portaal_gebruikers is
  'Klantaccounts voor /portaal. Los van medewerkers; leest nooit via RLS maar via de guard in lib/portaal/auth.ts.';
comment on column public.portaal_gebruikers.scope is
  'eigen_dossiers = alleen dossiers waar deze contactpersoon aan hangt; organisatie = alle dossiers van relatie_id.';

-- Losse dossiers buiten de scope-regel om: een VvE-lid, of de contactpersoon van
-- een derde partij die alleen bij dit ene project betrokken is.
create table if not exists public.portaal_gebruiker_dossiers (
  portaal_gebruiker_id uuid not null references public.portaal_gebruikers(id) on delete cascade,
  dossier_id           uuid not null references public.dossiers(id) on delete cascade,
  toegevoegd_op        timestamptz not null default now(),
  toegevoegd_door      uuid references public.medewerkers(id) on delete set null,
  primary key (portaal_gebruiker_id, dossier_id)
);

comment on table public.portaal_gebruiker_dossiers is
  'Extra dossiertoegang naast de scope-regel. Altijd optellend, nooit beperkend.';

-- ---------------------------------------------------------------------------
-- Wat er per dossier zichtbaar is
-- ---------------------------------------------------------------------------
-- Losse booleans en bewust géén jsonb: zo is een onderdeel dat er later bijkomt
-- default false in de database én in de code, in plaats van stil undefined.
create table if not exists public.portaal_dossier_instellingen (
  dossier_id           uuid primary key references public.dossiers(id) on delete cascade,
  actief               boolean not null default false,
  toon_bestanden       boolean not null default false,
  toon_fotos           boolean not null default false,
  toon_facturen        boolean not null default false,
  toon_formulieren     boolean not null default false,
  toon_aandachtspunten boolean not null default false,
  toon_planning        boolean not null default false,
  -- false = alleen fases met begin- en einddatum; true = ook de losse
  -- activiteiten. Medewerkers komen in geen van beide standen mee.
  planning_detail      boolean not null default false,
  toon_chat            boolean not null default false,
  -- Gereserveerd: afspraken volgen later uit het plan van aanpak.
  toon_afspraken       boolean not null default false,
  gewijzigd_op         timestamptz not null default now(),
  gewijzigd_door       uuid references public.medewerkers(id) on delete set null
);

comment on table public.portaal_dossier_instellingen is
  'Opt-in per dossier: geen rij = het dossier bestaat niet voor het portaal.';

-- ---------------------------------------------------------------------------
-- Vrijgegeven bestanden en foto's
-- ---------------------------------------------------------------------------
-- dossier_bestand_app_zichtbaar kan hier niet voor dienen: die heeft een
-- bouw7_bestand_id en sluit SharePoint dus uit.
--
-- bron_query is een bevroren kopie van BestandRij.bronQuery. Dat is het scharnier
-- van de beveiliging: het portaal bladert nooit live door Bouw7 of SharePoint, en
-- de downloadproxy haalt de bron uitsluitend hiervandaan — nooit uit parameters
-- die de bezoeker meestuurt.
create table if not exists public.portaal_bestanden (
  dossier_id     uuid not null references public.dossiers(id) on delete cascade,
  -- 'bouw7:<id>' | 'sharepoint:<itemId>' | 'storage:<bucket>/<pad>'
  sleutel        text not null,
  bron           text not null check (bron in ('bouw7','sharepoint','storage')),
  bron_query     text not null,
  naam           text,
  extensie       text,
  -- Scheidt de tab Bestanden van de tab Foto's zonder tweede tabel.
  soort          text not null check (soort in ('document','afbeelding')),
  grootte        bigint,
  datum          date,
  zichtbaar      boolean not null default true,
  gewijzigd_op   timestamptz not null default now(),
  gewijzigd_door uuid references public.medewerkers(id) on delete set null,
  primary key (dossier_id, sleutel)
);

create index if not exists portaal_bestanden_dossier_idx
  on public.portaal_bestanden (dossier_id) where zichtbaar;

comment on column public.portaal_bestanden.bron_query is
  'Bevroren BestandRij.bronQuery. De proxy leest de bron hier, nooit uit de querystring van de bezoeker.';

-- ---------------------------------------------------------------------------
-- Chat
-- ---------------------------------------------------------------------------
create table if not exists public.portaal_berichten (
  id                   uuid primary key default gen_random_uuid(),
  dossier_id           uuid not null references public.dossiers(id) on delete cascade,
  auteur_type          text not null check (auteur_type in ('klant','medewerker')),
  portaal_gebruiker_id uuid references public.portaal_gebruikers(id) on delete set null,
  medewerker_id        uuid references public.medewerkers(id) on delete set null,
  bericht              text not null,
  -- [{pad, naam, content_type, grootte}] in de private bucket portaal-bijlagen
  bijlagen             jsonb not null default '[]'::jsonb,
  -- Interne kanttekening in dezelfde draad. Wordt in de query weggefilterd,
  -- niet pas in de mapping.
  intern               boolean not null default false,
  created_at           timestamptz not null default now()
);

create index if not exists portaal_berichten_dossier_idx
  on public.portaal_berichten (dossier_id, created_at desc);

-- Ongelezen-teller volgens hetzelfde watermerk-patroon als changelog_gezien:
-- één tijdstempel per lezer per gesprek, geen markering per bericht.
create table if not exists public.portaal_bericht_gelezen (
  dossier_id  uuid not null references public.dossiers(id) on delete cascade,
  lezer_type  text not null check (lezer_type in ('klant','medewerker')),
  -- portaal_gebruikers.id of medewerkers.id, afhankelijk van lezer_type.
  lezer_id    uuid not null,
  gelezen_tot timestamptz not null default now(),
  primary key (dossier_id, lezer_type, lezer_id)
);

-- ---------------------------------------------------------------------------
-- Uitgaande mail
-- ---------------------------------------------------------------------------
-- Model: oplever_mail_wachtrij. Verschil: deze rijen kunnen wél door een cron
-- verstuurd worden, omdat portaalmail via de gedeelde postbus gaat (app-only
-- Graph) in plaats van namens een ingelogde medewerker.
--
-- In body_html staat nooit een magic link: die wordt pas vlak vóór verzending
-- gegenereerd, anders is hij verlopen zodra de wachtrij een keer achterloopt.
create table if not exists public.portaal_mail_wachtrij (
  id                   uuid primary key default gen_random_uuid(),
  dossier_id           uuid references public.dossiers(id) on delete cascade,
  portaal_gebruiker_id uuid references public.portaal_gebruikers(id) on delete cascade,
  soort                text not null check (soort in ('uitnodiging','nieuw_bericht','herinnering')),
  ontvangers           text[] not null,
  cc                   text[] not null default '{}',
  onderwerp            text not null,
  body_html            text,
  status               text not null default 'wachtend'
                         check (status in ('wachtend','verzonden','mislukt','geannuleerd')),
  sleutel              text,
  pogingen             integer not null default 0,
  laatste_fout         text,
  verzonden_op         timestamptz,
  created_at           timestamptz not null default now()
);

-- Voorkomt dat dezelfde melding twee keer klaarstaat.
create unique index if not exists portaal_mail_wachtrij_uniek
  on public.portaal_mail_wachtrij (dossier_id, soort, sleutel)
  where sleutel is not null and status = 'wachtend';
create index if not exists portaal_mail_wachtrij_wachtend_idx
  on public.portaal_mail_wachtrij (created_at) where status = 'wachtend';

-- ---------------------------------------------------------------------------
-- Toegangslog (AVG-aantoonbaarheid)
-- ---------------------------------------------------------------------------
create table if not exists public.portaal_toegang_log (
  id                   bigserial primary key,
  portaal_gebruiker_id uuid,
  dossier_id           uuid,
  onderdeel            text,
  sleutel              text,
  ip                   text,
  created_at           timestamptz not null default now()
);

create index if not exists portaal_toegang_log_gebruiker_idx
  on public.portaal_toegang_log (portaal_gebruiker_id, created_at desc);

comment on table public.portaal_toegang_log is
  'Wie zag wat wanneer in het klantportaal. Bewust zonder foreign keys: het log blijft staan als een account verdwijnt.';

-- ---------------------------------------------------------------------------
-- Formuliersjablonen vrijgeven
-- ---------------------------------------------------------------------------
-- Opt-in per sjabloon in plaats van per inzending: je besluit één keer dat een
-- opleverchecklist klantwaardig is, niet honderd keer.
alter table public.form_templates
  add column if not exists portaal_zichtbaar boolean not null default false;

comment on column public.form_templates.portaal_zichtbaar is
  'Mogen ingediende inzendingen van dit sjabloon in het klantportaal verschijnen.';

-- ---------------------------------------------------------------------------
-- RLS: dicht voor iedereen behalve platformgebruikers
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'portaal_gebruikers',
    'portaal_gebruiker_dossiers',
    'portaal_dossier_instellingen',
    'portaal_bestanden',
    'portaal_berichten',
    'portaal_bericht_gelezen',
    'portaal_mail_wachtrij',
    'portaal_toegang_log'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists platform_gebruiker_toegang on public.%I', t);
    execute format(
      'create policy platform_gebruiker_toegang on public.%I for all to authenticated '
      || 'using (public.is_platform_gebruiker()) with check (public.is_platform_gebruiker())', t);
  end loop;
end $$;
