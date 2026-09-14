-- =====================================================================
-- Personeelshandboek — het medewerkershandboek als levende inhoud in EVA
-- =====================================================================
-- LET OP: dit staat volledig los van `public.handboek_regels`. Dat is de
-- regelset van het wagenpark ("Handboek auto van de zaak", gelezen in
-- lib/wagenpark/compliance-kern.ts). Vandaar de prefix `personeelshandboek_`.
--
-- Waarom rijen per sectie/blok en géén JSONB-schema per hoofdstuk zoals
-- toolbox: zichtbaarheid is hier de kern. Het handboek bestaat vandaag als
-- twee Word-documenten (intern + Flexkrachten) waarin dezelfde hoofdstukken
-- ándere tekst hebben. Eén bron met zichtbaarheid per alinea maakt het
-- structureel onmogelijk dat die twee weer uit elkaar lopen — maar dat kan
-- alleen als de filtering in SQL gebeurt. Met één JSONB-blob per hoofdstuk
-- zou de verborgen tekst de database verlaten en pas in de browser worden
-- weggefilterd; een RLS-policy kan niet "de helft van een rij" teruggeven.

-- ── Secties (hoofdstukken + "Wat te doen bij"-situaties) ──────────────
create table if not exists public.personeelshandboek_secties (
  id              uuid primary key default gen_random_uuid(),
  parent_id       uuid references public.personeelshandboek_secties(id) on delete cascade,
  -- Deeplink: /m/handboek/<slug>. Stabiel houden; zoekresultaten en
  -- verwijzingen vanuit situatiekaarten hangen eraan.
  slug            text not null unique,
  titel           text not null,
  samenvatting    text,
  icoon           text,
  volgorde        integer not null default 0,
  soort           text not null default 'hoofdstuk'
                    check (soort in ('hoofdstuk','situatie')),
  status          text not null default 'concept'
                    check (status in ('concept','gepubliceerd','gearchiveerd')),
  -- Leeg = zichtbaar voor iedereen. Anders: OR over de kenmerken van de lezer.
  zichtbaar_voor  text[] not null default '{}',
  -- Wint altijd van zichtbaar_voor. Hiermee maak je AND:
  -- zichtbaar_voor {voertuig} + verborgen_voor {extern} = eigen personeel mét auto.
  verborgen_voor  text[] not null default '{}',
  aangemaakt_door uuid references auth.users(id) on delete set null,
  aangemaakt_op   timestamptz not null default now(),
  bijgewerkt_op   timestamptz not null default now()
);
comment on table public.personeelshandboek_secties is
  'Hoofdstukken en "Wat te doen bij"-situaties van het medewerkershandboek. Niets te maken met handboek_regels (wagenpark).';

-- ── Inhoudsblokken ───────────────────────────────────────────────────
create table if not exists public.personeelshandboek_blokken (
  id              uuid primary key default gen_random_uuid(),
  sectie_id       uuid not null references public.personeelshandboek_secties(id) on delete cascade,
  volgorde        integer not null default 0,
  type            text not null check (type in
                    ('kop','tekst','lijst','tabel','let-op','afbeelding','bijlage','contact','stap')),
  inhoud          jsonb not null default '{}'::jsonb,
  -- Platte projectie van de tekstvelden uit `inhoud`, voor de zoekindex en de
  -- fragmentweergave. Wordt in de server-action gevuld bij opslaan en niet in
  -- een trigger: anders staat de projectielogica op twee plekken.
  zoektekst       text not null default '',
  status          text not null default 'concept'
                    check (status in ('concept','gepubliceerd')),
  zichtbaar_voor  text[] not null default '{}',
  verborgen_voor  text[] not null default '{}',
  bijgewerkt_op   timestamptz not null default now()
);
comment on table public.personeelshandboek_blokken is
  'Eén alinea, lijst, tabel of stap binnen een sectie. Zichtbaarheid staat per blok, zodat intern en flex dezelfde hoofdstukken delen met afwijkende tekst.';

-- ── Bijlagen (privé bucket, uitgeleverd via proxy-route) ─────────────
create table if not exists public.personeelshandboek_bijlagen (
  id              uuid primary key default gen_random_uuid(),
  sectie_id       uuid references public.personeelshandboek_secties(id) on delete set null,
  titel           text not null,
  omschrijving    text,
  bestandsnaam    text not null,
  storage_path    text not null,
  mimetype        text not null,
  grootte         bigint,
  volgorde        integer not null default 0,
  status          text not null default 'gepubliceerd'
                    check (status in ('concept','gepubliceerd','gearchiveerd')),
  zichtbaar_voor  text[] not null default '{}',
  verborgen_voor  text[] not null default '{}',
  geupload_door   uuid references auth.users(id) on delete set null,
  aangemaakt_op   timestamptz not null default now()
);
comment on table public.personeelshandboek_bijlagen is
  'PDF-bijlagen bij het handboek (VCA-boek, verzuimprotocol, autoregeling). Inhoud wordt niet doorzocht — bewuste keuze.';

-- ── Contactrollen voor de belknoppen ─────────────────────────────────
create table if not exists public.personeelshandboek_contacten (
  id                uuid primary key default gen_random_uuid(),
  rol               text not null,
  -- Nummer komt live uit `medewerkers.mobiel`; zo hoeft er niets aan de tekst
  -- te veranderen als iemand uit dienst gaat.
  medewerker_id     uuid references public.medewerkers(id) on delete set null,
  -- Voor externe partijen zonder medewerker-rij: 112, Remplooi, Renewi.
  telefoon_override text,
  volgorde          integer not null default 0,
  zichtbaar_voor    text[] not null default '{}',
  verborgen_voor    text[] not null default '{}',
  aangemaakt_op     timestamptz not null default now(),
  bijgewerkt_op     timestamptz not null default now()
);
comment on table public.personeelshandboek_contacten is
  'Wie bel je bij welke situatie. Telefoonnummer komt uit medewerkers, niet uit de handboektekst.';

-- ── Publicatiesnapshots (audit / diff / export) ──────────────────────
create table if not exists public.personeelshandboek_versies (
  id                uuid primary key default gen_random_uuid(),
  versienummer      integer not null unique,
  inhoud            jsonb not null,
  toelichting       text,
  gepubliceerd_door uuid references auth.users(id) on delete set null,
  gepubliceerd_op   timestamptz not null default now()
);
comment on table public.personeelshandboek_versies is
  'Momentopname van de hele boom bij publiceren. Wordt NOOIT gebruikt om te renderen — alleen voor "wat stond er toen", diff en export.';

-- ── Indexen ──────────────────────────────────────────────────────────
create index if not exists personeelshandboek_secties_parent_idx  on public.personeelshandboek_secties(parent_id);
create index if not exists personeelshandboek_secties_soort_idx   on public.personeelshandboek_secties(soort, status, volgorde);
create index if not exists personeelshandboek_secties_zicht_idx   on public.personeelshandboek_secties using gin (zichtbaar_voor);
create index if not exists personeelshandboek_blokken_sectie_idx  on public.personeelshandboek_blokken(sectie_id, volgorde);
create index if not exists personeelshandboek_blokken_zicht_idx   on public.personeelshandboek_blokken using gin (zichtbaar_voor);
create index if not exists personeelshandboek_bijlagen_sectie_idx on public.personeelshandboek_bijlagen(sectie_id);
create index if not exists personeelshandboek_contacten_mdw_idx   on public.personeelshandboek_contacten(medewerker_id);

-- ── updated_at triggers ──────────────────────────────────────────────
drop trigger if exists personeelshandboek_secties_bijgewerkt on public.personeelshandboek_secties;
create trigger personeelshandboek_secties_bijgewerkt
  before update on public.personeelshandboek_secties
  for each row execute function public.set_bijgewerkt_op();

drop trigger if exists personeelshandboek_blokken_bijgewerkt on public.personeelshandboek_blokken;
create trigger personeelshandboek_blokken_bijgewerkt
  before update on public.personeelshandboek_blokken
  for each row execute function public.set_bijgewerkt_op();

drop trigger if exists personeelshandboek_contacten_bijgewerkt on public.personeelshandboek_contacten;
create trigger personeelshandboek_contacten_bijgewerkt
  before update on public.personeelshandboek_contacten
  for each row execute function public.set_bijgewerkt_op();

-- ── Kenmerken van de ingelogde lezer ─────────────────────────────────
-- Dit is de enige plek waar "wie ben jij" wordt vertaald naar kenmerken. De
-- inhoud verwijst naar 'intern' / 'extern' / 'voertuig' / 'werkmaatschappij:001',
-- nooit rechtstreeks naar een kolom. Komt er ooit een `contractvorm`-kolom
-- (zzp vs. uitzend), dan verandert alleen deze functie — niet de content.
--
-- security definer omdat een app-gebruiker `medewerkers` niet mag lezen
-- (is_platform_gebruiker()-muur) en `voertuig_bestuurders` al helemaal niet.
create or replace function public.handboek_kenmerken()
returns text[]
language sql
security definer
set search_path = public
stable
as $fn$
  with mw as (
    select m.id, m.extern, b.code as wm_code
      from public.medewerkers m
      left join public.bedrijfsgegevens b on b.id = m.werkmaatschappij_id
     where m.auth_user_id = auth.uid()
       and m.actief = true
     limit 1
  )
  select coalesce(
       array(select 'intern' from mw where extern = false)
    || array(select 'extern' from mw where extern = true)
    || array(select 'werkmaatschappij:' || wm_code from mw where wm_code is not null)
    -- Heeft deze medewerker een auto of bus van de zaak? De koppeling loopt in
    -- de praktijk via ulu_users (de telematicagebruiker); voertuig_bestuurders
    -- .medewerker_id is meestal leeg maar wordt wél meegenomen, want die kolom
    -- kan later alsnog gevuld raken.
    || array(
         select 'voertuig' from mw
          where exists (
            select 1
              from public.voertuig_bestuurders vb
             where vb.eind_datum is null
               and ( vb.medewerker_id = mw.id
                  or vb.ulu_user_id in (
                       select uu.id from public.ulu_users uu where uu.medewerker_id = mw.id) )
          )
       ),
    '{}'::text[]);
$fn$;
comment on function public.handboek_kenmerken() is
  'Kenmerken van de ingelogde medewerker voor de zichtbaarheid van handboek-inhoud. Enige vertaling van medewerkergegevens naar kenmerk-strings.';

revoke all on function public.handboek_kenmerken() from public;
grant execute on function public.handboek_kenmerken() to authenticated;

-- ── RLS ──────────────────────────────────────────────────────────────
-- Leesrecht staat in de database, niet alleen in de app. Dit is bewust de
-- enige poortwachter voor gewone lezers: zo bestaat de zichtbaarheidsregel op
-- één plek en kan een filterfout in TypeScript geen verborgen tekst lekken.
--
-- Er zijn GEEN write-policies: muteren gaat uitsluitend via de service-role
-- achter vereisRecht('medewerkershandboek', …).
--
-- De aanroep staat telkens in `(select …)` zodat Postgres hem één keer per
-- statement evalueert in plaats van per rij — zie 20260909b voor die les.

alter table public.personeelshandboek_secties   enable row level security;
alter table public.personeelshandboek_blokken   enable row level security;
alter table public.personeelshandboek_bijlagen  enable row level security;
alter table public.personeelshandboek_contacten enable row level security;
alter table public.personeelshandboek_versies   enable row level security;

drop policy if exists personeelshandboek_secties_lezen on public.personeelshandboek_secties;
create policy personeelshandboek_secties_lezen on public.personeelshandboek_secties
  for select to authenticated
  using (
    status = 'gepubliceerd'
    and (zichtbaar_voor = '{}' or zichtbaar_voor && (select public.handboek_kenmerken()))
    and not (verborgen_voor && (select public.handboek_kenmerken()))
  );

drop policy if exists personeelshandboek_blokken_lezen on public.personeelshandboek_blokken;
create policy personeelshandboek_blokken_lezen on public.personeelshandboek_blokken
  for select to authenticated
  using (
    status = 'gepubliceerd'
    and (zichtbaar_voor = '{}' or zichtbaar_voor && (select public.handboek_kenmerken()))
    and not (verborgen_voor && (select public.handboek_kenmerken()))
    -- Een blok erft de zichtbaarheid van zijn sectie: een hoofdstuk dat je niet
    -- mag zien, mag je ook niet blok voor blok uitlezen.
    and exists (
      select 1 from public.personeelshandboek_secties s
       where s.id = sectie_id
         and s.status = 'gepubliceerd'
         and (s.zichtbaar_voor = '{}' or s.zichtbaar_voor && (select public.handboek_kenmerken()))
         and not (s.verborgen_voor && (select public.handboek_kenmerken()))
    )
  );

drop policy if exists personeelshandboek_bijlagen_lezen on public.personeelshandboek_bijlagen;
create policy personeelshandboek_bijlagen_lezen on public.personeelshandboek_bijlagen
  for select to authenticated
  using (
    status = 'gepubliceerd'
    and (zichtbaar_voor = '{}' or zichtbaar_voor && (select public.handboek_kenmerken()))
    and not (verborgen_voor && (select public.handboek_kenmerken()))
    -- sectie_id is optioneel (een bijlage mag los staan); hangt hij ergens aan,
    -- dan moet die sectie zichtbaar zijn.
    and (
      sectie_id is null
      or exists (
        select 1 from public.personeelshandboek_secties s
         where s.id = sectie_id
           and s.status = 'gepubliceerd'
           and (s.zichtbaar_voor = '{}' or s.zichtbaar_voor && (select public.handboek_kenmerken()))
           and not (s.verborgen_voor && (select public.handboek_kenmerken()))
      )
    )
  );

drop policy if exists personeelshandboek_contacten_lezen on public.personeelshandboek_contacten;
create policy personeelshandboek_contacten_lezen on public.personeelshandboek_contacten
  for select to authenticated
  using (
    (zichtbaar_voor = '{}' or zichtbaar_voor && (select public.handboek_kenmerken()))
    and not (verborgen_voor && (select public.handboek_kenmerken()))
  );

-- Versies zijn beheer-materiaal: geen leesrecht voor gewone gebruikers. RLS
-- staat aan zonder policy, dus alleen de service-role komt erbij.

-- ── Storage: privé bucket voor de bijlagen ───────────────────────────
-- Privé en niet publiek zoals toolbox-afbeeldingen: een bijlage kan
-- intern-only zijn, en dan hoort hij niet op een raadbare URL te staan.
-- Uitlevering loopt via /api/handboek/bijlage/<id>, dat per aanvraag hertoetst.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'handboek-bijlagen', 'handboek-bijlagen', false, 20971520,
  array['application/pdf','image/jpeg','image/jpg','image/png','image/webp']
)
on conflict (id) do nothing;

-- Bewust GEEN storage-policy voor `authenticated`: er is geen enkele reden om
-- deze bucket rechtstreeks vanuit de browser te benaderen. Uploaden doet de
-- beheeractie met de service-role, lezen doet de proxy-route.
