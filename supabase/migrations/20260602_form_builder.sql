-- =====================================================================
-- Form Builder — digitale formulieren, inzendingen en taken
-- =====================================================================

-- ── Templates ────────────────────────────────────────────────────────
create table if not exists public.form_templates (
  id              uuid primary key default gen_random_uuid(),
  naam            text not null,
  omschrijving    text,
  categorie       text,           -- werkbon | inspectie | oplevering | checklist | overig
  status          text not null default 'concept',  -- concept | gepubliceerd | gearchiveerd
  huidige_versie  integer not null default 0,
  aangemaakt_door uuid references auth.users(id) on delete set null,
  aangemaakt_op   timestamptz not null default now(),
  bijgewerkt_op   timestamptz not null default now()
);

-- ── Versies (schema JSON) ─────────────────────────────────────────────
create table if not exists public.form_versies (
  id              uuid primary key default gen_random_uuid(),
  template_id     uuid not null references public.form_templates(id) on delete cascade,
  versienummer    integer not null,
  schema          jsonb not null default '{"version":1,"fields":[]}'::jsonb,
  wijzigingsnota  text,
  aangemaakt_door uuid references auth.users(id) on delete set null,
  aangemaakt_op   timestamptz not null default now(),
  unique (template_id, versienummer)
);

-- ── Inzendingen ───────────────────────────────────────────────────────
create table if not exists public.form_inzendingen (
  id               uuid primary key default gen_random_uuid(),
  template_id      uuid not null references public.form_templates(id) on delete restrict,
  versie_id        uuid not null references public.form_versies(id) on delete restrict,
  status           text not null default 'concept',  -- concept | ingediend | goedgekeurd | afgekeurd
  waarden          jsonb not null default '{}'::jsonb,
  submission_uuid  text unique,          -- client-gegenereerd voor dedup
  dossier_id       uuid,                 -- optionele koppeling naar dossier
  project_ref      text,                 -- vrije tekst projectreferentie
  ingediend_op     timestamptz,
  ingediend_door   uuid references auth.users(id) on delete set null,
  aangemaakt_door  uuid references auth.users(id) on delete set null,
  aangemaakt_op    timestamptz not null default now(),
  bijgewerkt_op    timestamptz not null default now()
);

-- ── Taken ──────────────────────────────────────────────────────────────
create table if not exists public.form_taken (
  id              uuid primary key default gen_random_uuid(),
  template_id     uuid not null references public.form_templates(id) on delete cascade,
  inzending_id    uuid references public.form_inzendingen(id) on delete set null,
  toegewezen_aan  uuid references auth.users(id) on delete set null,
  deadline        timestamptz,
  status          text not null default 'open',  -- open | bezig | ingediend | afgekeurd | afgerond
  opmerkingen     text,
  vooringevuld    jsonb default '{}'::jsonb,
  dossier_id      uuid,
  aangemaakt_door uuid references auth.users(id) on delete set null,
  aangemaakt_op   timestamptz not null default now(),
  bijgewerkt_op   timestamptz not null default now()
);

-- ── Bestanden ──────────────────────────────────────────────────────────
create table if not exists public.form_bestanden (
  id              uuid primary key default gen_random_uuid(),
  inzending_id    uuid not null references public.form_inzendingen(id) on delete cascade,
  veld_naam       text not null,
  bestandsnaam    text not null,
  opslag_pad      text not null,          -- Supabase Storage path
  mime_type       text,
  grootte_bytes   bigint,
  aangemaakt_op   timestamptz not null default now()
);

-- ── Rechten ────────────────────────────────────────────────────────────
create table if not exists public.form_rechten (
  id           uuid primary key default gen_random_uuid(),
  template_id  uuid not null references public.form_templates(id) on delete cascade,
  subject_type text not null,  -- user | rol
  subject_id   text not null,  -- user-uuid of rolnaam
  rol          text not null,  -- admin | bewerker | invuller | lezer
  aangemaakt_op timestamptz not null default now(),
  unique (template_id, subject_type, subject_id)
);

-- ── Indexen ────────────────────────────────────────────────────────────
create index if not exists form_templates_status_idx      on public.form_templates(status);
create index if not exists form_templates_categorie_idx   on public.form_templates(categorie);
create index if not exists form_versies_template_idx      on public.form_versies(template_id);
create index if not exists form_inzendingen_template_idx  on public.form_inzendingen(template_id);
create index if not exists form_inzendingen_status_idx    on public.form_inzendingen(status);
create index if not exists form_inzendingen_versie_idx    on public.form_inzendingen(versie_id);
create index if not exists form_taken_template_idx        on public.form_taken(template_id);
create index if not exists form_taken_toegewezen_idx      on public.form_taken(toegewezen_aan);
create index if not exists form_taken_status_idx          on public.form_taken(status);
create index if not exists form_bestanden_inzending_idx   on public.form_bestanden(inzending_id);

-- ── updated_at trigger ─────────────────────────────────────────────────
create or replace function public.set_bijgewerkt_op()
returns trigger language plpgsql as $$
begin
  new.bijgewerkt_op = now();
  return new;
end;
$$;

create trigger form_templates_bijgewerkt
  before update on public.form_templates
  for each row execute function public.set_bijgewerkt_op();

create trigger form_inzendingen_bijgewerkt
  before update on public.form_inzendingen
  for each row execute function public.set_bijgewerkt_op();

create trigger form_taken_bijgewerkt
  before update on public.form_taken
  for each row execute function public.set_bijgewerkt_op();
