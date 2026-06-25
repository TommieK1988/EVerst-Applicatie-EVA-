-- Ploegen: beheerde lijst met één teamleider per ploeg; medewerkers krijgen een ploeg.
-- Sortering/slicing in de medewerkerplanning gebruikt de ploeg; medewerkers zonder ploeg
-- worden onderaan getoond.

create table if not exists public.ploegen (
  id            uuid primary key default gen_random_uuid(),
  naam          text not null,
  teamleider_id uuid references public.medewerkers(id) on delete set null,
  volgorde      integer not null default 0,
  actief        boolean not null default true,
  created_at    timestamptz not null default now()
);

alter table public.medewerkers
  add column if not exists ploeg_id uuid references public.ploegen(id) on delete set null;

create index if not exists idx_medewerkers_ploeg on public.medewerkers(ploeg_id);

-- RLS-basislijn: zelfde patroon als de overige beheertabellen (alleen authenticated;
-- admin/service-role omzeilt RLS sowieso).
alter table public.ploegen enable row level security;
drop policy if exists app_authenticated_all on public.ploegen;
create policy app_authenticated_all on public.ploegen for all to authenticated using (true) with check (true);
