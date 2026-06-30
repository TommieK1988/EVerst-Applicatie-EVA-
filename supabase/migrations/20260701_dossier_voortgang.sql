-- =====================================================================
-- Dossier voortgang (% gereed) — door EVA ingevoerd, terug te schrijven naar Bouw7
-- Twee niveaus:
--   • 'project'        — één % gereed per project (Management + dossier-totaal)
--   • 'bewakingscode'  — standopname per bewakingscode (Financieel-tab, opdracht)
-- Bewust NIET opgeslagen in management_projecten: die tabel wordt bij elke
-- read-sync volledig overschreven. Deze tabel is de EVA-bron + audit + fallback;
-- de read-sync mag een 'pending' waarde niet overschrijven (loop-preventie).
-- =====================================================================

create table if not exists public.dossier_voortgang (
  id                 uuid primary key default gen_random_uuid(),

  -- Koppeling
  dossier_id         uuid,
  bouw7_id           text not null,
  niveau             text not null check (niveau in ('project', 'bewakingscode')),
  bewakingscode      text,            -- gevuld bij niveau 'bewakingscode'

  -- Waarde
  pct_gereed         numeric(6,2) not null check (pct_gereed >= 0 and pct_gereed <= 100),

  -- Herkomst / Bouw7-sync (richting: uit EVA → Bouw7)
  bron               text not null default 'eva',
  bouw7_sync_status  text not null default 'pending',  -- 'pending' | 'synced' | 'error'
  bouw7_sync_fout    text,
  bouw7_laatst_sync  timestamptz,

  -- Audit
  gewijzigd_door     text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Eén regel per (project, niveau, code). NULLS NOT DISTINCT (PG15+) dedupliceert ook de
-- project-rijen (bewakingscode NULL). Gewone kolom-index zodat de upsert
-- ON CONFLICT (bouw7_id, niveau, bewakingscode) hierop matcht.
create unique index if not exists dv_uniek_idx
  on public.dossier_voortgang (bouw7_id, niveau, bewakingscode) nulls not distinct;

create index if not exists dv_dossier_idx on public.dossier_voortgang(dossier_id);
create index if not exists dv_sync_status_idx on public.dossier_voortgang(bouw7_sync_status);

-- RLS: alleen ingelogde gebruikers (gelijk aan management_projecten)
alter table public.dossier_voortgang enable row level security;

create policy "Authenticated users can read dossier_voortgang"
  on public.dossier_voortgang for select
  to authenticated using (true);

create policy "Authenticated users can insert dossier_voortgang"
  on public.dossier_voortgang for insert
  to authenticated with check (true);

create policy "Authenticated users can update dossier_voortgang"
  on public.dossier_voortgang for update
  to authenticated using (true);
