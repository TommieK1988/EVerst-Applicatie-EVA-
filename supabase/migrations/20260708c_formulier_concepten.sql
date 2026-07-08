-- Fix: FormFiller concept-drafts gedeeld maken per gebruiker (zelfde bug-klasse).
--
-- Een half-ingevuld formulier werd alleen device-lokaal bewaard
-- (localStorage `form_draft_${scope}`). Wissel je van apparaat/browser, dan is
-- het concept weg. We bewaren het concept nu per (gebruiker, scope) in Supabase,
-- zodat het meereist. localStorage blijft een offline-mirror.

create table if not exists public.formulier_concepten (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null,
  scope         text not null,
  template_id   uuid,
  dossier_id    text,
  waarden       jsonb not null default '{}'::jsonb,
  bijgewerkt_op timestamptz not null default now(),
  unique (user_id, scope)
);

comment on table public.formulier_concepten is
  'Per (gebruiker, scope) opgeslagen concept van een nog-niet-ingediend formulier. Vervangt de device-lokale localStorage-key form_draft_${scope}; wordt verwijderd bij indienen.';

-- Per-gebruiker policy: een gebruiker ziet/bewerkt alleen eigen concepten. De
-- server-actions gebruiken de admin-client (omzeilt RLS) en scopen expliciet op
-- user_id; deze policy is defense-in-depth voor eventuele sessie-client-toegang.
alter table public.formulier_concepten enable row level security;
drop policy if exists eigen_concepten on public.formulier_concepten;
create policy eigen_concepten on public.formulier_concepten
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
