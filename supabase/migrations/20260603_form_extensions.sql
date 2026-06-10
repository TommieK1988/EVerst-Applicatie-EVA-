-- =====================================================================
-- Form Builder uitbreidingen: PDF config, KAM/VGM, taak-koppeling,
-- notificaties
-- =====================================================================

-- ── Universele PDF-configuratie ──────────────────────────────────────
create table if not exists public.formulier_pdf_config (
  id               uuid primary key default gen_random_uuid(),
  toon_logo        boolean not null default true,
  toon_invuller    boolean not null default true,
  toon_project_ref boolean not null default true,
  koptekst         text,
  voettekst        text,
  bijgewerkt_op    timestamptz not null default now()
);

-- Zorg dat er altijd precies één rij is
insert into public.formulier_pdf_config (toon_logo, toon_invuller, toon_project_ref)
select true, true, true
where not exists (select 1 from public.formulier_pdf_config);

-- ── KAM/VGM-vlag op form_templates ────────────────────────────────
alter table public.form_templates
  add column if not exists is_kam_vgm boolean not null default false;

-- ── Formulier-koppeling op reguliere taken ─────────────────────────
-- Let op: de 'tasks' tabel behoort aan het taken-module schema.
-- We voegen de kolom toe aan public.tasks (als die bestaat).
alter table public.tasks
  add column if not exists formulier_template_id uuid
    references public.form_templates(id) on delete set null;

-- ── In-app notificaties ────────────────────────────────────────────
create table if not exists public.notificaties (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  type          text not null,   -- 'formulier_taak' | 'formulier_ingediend' | 'algemeen'
  titel         text not null,
  body          text,
  url           text,
  gelezen       boolean not null default false,
  aangemaakt_op timestamptz not null default now()
);

create index if not exists notificaties_user_gelezen_idx
  on public.notificaties(user_id, gelezen, aangemaakt_op desc);

-- RLS: gebruiker ziet en beheert alleen eigen notificaties
alter table public.notificaties enable row level security;

create policy "eigen_notificaties"
  on public.notificaties
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- RLS: service-role mag voor iedereen notificaties aanmaken
create policy "service_role_insert_notificaties"
  on public.notificaties
  for insert
  to service_role
  with check (true);
