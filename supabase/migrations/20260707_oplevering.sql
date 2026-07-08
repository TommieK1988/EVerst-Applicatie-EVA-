-- Oplevering — EVA-native opleverproces per opdracht-dossier (domein Fase 9).
--
-- Eén oplevermoment (inspectie) met opleverpunten (restpunten). Elk punt heeft een eigen
-- statusmachine, foto's, een reactiethread (afmelden/reviewen) en kan aan een eigen medewerker
-- óf aan een onderaannemer/leverancier (relaties) worden toegewezen. Een punt kan als "extra werk"
-- gemarkeerd worden → koppelt aan een meerwerk_regels-rij. Ondertekening ter plekke (handtekening-
-- pad) of op afstand (akkoord-knop) via een tokenlink; onderaannemers melden hun punten af via
-- datzelfde publieke tokenportaal. Volgt het patroon van meerwerk_regels: EVA leidend, admin-client
-- schrijft, RLS read-only voor authenticated.

-- ── Oplevermoment ─────────────────────────────────────────────────────────────
create table if not exists public.oplever_momenten (
  id             uuid primary key default gen_random_uuid(),
  dossier_id     uuid not null references public.dossiers(id) on delete cascade,
  titel          text not null,
  type           text not null default 'eindoplevering'
                   check (type in ('vooroplevering','eindoplevering','tussenoplevering','overig')),
  status         text not null default 'concept'
                   check (status in ('concept','in_uitvoering','gereed_voor_ondertekening','ondertekend','afgerond')),
  opgeleverd_op  date,
  opmerking      text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid
);

create index if not exists idx_oplever_momenten_dossier on public.oplever_momenten(dossier_id);

comment on table public.oplever_momenten is
  'EVA-native oplevermoment (inspectie) per opdracht-dossier; bundelt opleverpunten en handtekeningen.';

-- ── Opleverpunt ───────────────────────────────────────────────────────────────
create table if not exists public.oplever_punten (
  id                       uuid primary key default gen_random_uuid(),
  moment_id                uuid not null references public.oplever_momenten(id) on delete cascade,
  dossier_id               uuid not null references public.dossiers(id) on delete cascade,
  volgnummer               int  not null default 1,          -- per moment oplopend (weergave "OP-01")
  omschrijving             text not null,
  ruimte                   text,                             -- locatie/ruimte binnen het object
  status                   text not null default 'open'
                             check (status in ('open','in_behandeling','opgelost','geaccepteerd','geweigerd')),
  toegewezen_type          text check (toegewezen_type in ('medewerker','relatie')),
  toegewezen_medewerker_id uuid references public.medewerkers(id) on delete set null,
  toegewezen_relatie_id    uuid references public.relaties(id) on delete set null,
  deadline                 date,
  is_extra_werk            boolean not null default false,
  meerwerk_regel_id        uuid references public.meerwerk_regels(id) on delete set null,
  geweigerd_reden          text,
  afgemeld_op              timestamptz,                      -- gezet zodra punt op 'opgelost' komt
  geaccepteerd_op          timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  created_by               uuid
);

create index if not exists idx_oplever_punten_moment   on public.oplever_punten(moment_id);
create index if not exists idx_oplever_punten_dossier  on public.oplever_punten(dossier_id);
create index if not exists idx_oplever_punten_relatie  on public.oplever_punten(toegewezen_relatie_id);

comment on table public.oplever_punten is
  'Opleverpunt (restpunt) binnen een oplevermoment; toewijsbaar aan medewerker of relatie, optioneel gekoppeld aan een meerwerk_regels-rij bij "extra werk".';

-- ── Reactie-/afmeldthread per punt ────────────────────────────────────────────
create table if not exists public.oplever_punt_reacties (
  id                   uuid primary key default gen_random_uuid(),
  punt_id              uuid not null references public.oplever_punten(id) on delete cascade,
  auteur_type          text not null default 'intern'
                         check (auteur_type in ('intern','onderaannemer')),
  auteur_naam          text,
  auteur_medewerker_id uuid references public.medewerkers(id) on delete set null,
  soort                text not null default 'opmerking'
                         check (soort in ('afmelding','review','opmerking')),
  opmerking            text,
  foto_urls            text[] not null default '{}',
  created_at           timestamptz not null default now()
);

create index if not exists idx_oplever_reacties_punt on public.oplever_punt_reacties(punt_id);

comment on table public.oplever_punt_reacties is
  'Reactie-/afmeldthread op een opleverpunt: intern (medewerker/uitvoerder) of onderaannemer via tokenportaal, met foto''s.';

-- ── Foto''s per punt ──────────────────────────────────────────────────────────
create table if not exists public.oplever_fotos (
  id          uuid primary key default gen_random_uuid(),
  punt_id     uuid not null references public.oplever_punten(id) on delete cascade,
  url         text not null,
  soort       text not null default 'algemeen' check (soort in ('voor','na','algemeen')),
  created_at  timestamptz not null default now(),
  created_by  uuid
);

create index if not exists idx_oplever_fotos_punt on public.oplever_fotos(punt_id);

comment on table public.oplever_fotos is
  'Foto''s bij een opleverpunt (voor/na/algemeen); opgeslagen in de publieke oplever-fotos storage-bucket.';

-- ── Handtekeningen / akkoord per moment ───────────────────────────────────────
create table if not exists public.oplever_handtekeningen (
  id               uuid primary key default gen_random_uuid(),
  moment_id        uuid not null references public.oplever_momenten(id) on delete cascade,
  rol              text not null check (rol in ('opdrachtgever','opzichter','uitvoerder')),
  naam             text,
  methode          text not null default 'pad' check (methode in ('pad','akkoord_knop')),
  handtekening_url text,                                     -- null bij methode 'akkoord_knop'
  akkoord_op       timestamptz not null default now(),
  ip               text,
  created_at       timestamptz not null default now()
);

create index if not exists idx_oplever_handtekeningen_moment on public.oplever_handtekeningen(moment_id);

comment on table public.oplever_handtekeningen is
  'Ondertekening/akkoord van een oplevermoment: ter plekke (pad → PNG-url) of op afstand (akkoord_knop) via tokenlink.';

-- ── Publieke toegang-tokens (onderaannemer afmelden / ondertekening / feedback) ─
create table if not exists public.oplever_toegang_tokens (
  id                uuid primary key default gen_random_uuid(),
  token_hash        text not null unique,                   -- sha-256 van de ruwe token (alleen in de mail-URL)
  dossier_id        uuid not null references public.dossiers(id) on delete cascade,
  scope             text not null check (scope in ('onderaannemer','ondertekening','feedback')),
  relatie_id        uuid references public.relaties(id) on delete set null,
  moment_id         uuid references public.oplever_momenten(id) on delete cascade,
  form_template_id  uuid,
  omschrijving      text,                                   -- vrij label (bv. ontvanger-naam)
  verloopt_op       timestamptz,
  gebruikt_op       timestamptz,
  created_at        timestamptz not null default now(),
  created_by        uuid
);

create index if not exists idx_oplever_tokens_dossier on public.oplever_toegang_tokens(dossier_id);

comment on table public.oplever_toegang_tokens is
  'Gehashte tokens voor publieke tokenlinks (geen login): onderaannemer afmelden, opdrachtgever-akkoord en bewonersfeedback. Ruwe token zit alleen in de verstuurde URL.';

-- ── RLS-basislijn (zelfde patroon als 20260616c / meerwerk_regels) ────────────
-- Schrijven gebeurt uitsluitend via server-actions met de admin-client; het publieke
-- tokenportaal draait óók op de admin-client (na token-validatie), dus RLS hoeft niet open.
do $$
declare t text;
begin
  foreach t in array array[
    'oplever_momenten','oplever_punten','oplever_punt_reacties',
    'oplever_fotos','oplever_handtekeningen','oplever_toegang_tokens'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists app_authenticated_all on public.%I', t);
    execute format(
      'create policy app_authenticated_all on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- ── Storage-bucket voor opleverfoto''s (publiek, zoals werkbon-fotos) ──────────
insert into storage.buckets (id, name, public)
values ('oplever-fotos', 'oplever-fotos', true)
on conflict (id) do nothing;
