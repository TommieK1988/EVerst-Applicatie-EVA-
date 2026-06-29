-- Substatus-historie per dossier — basis voor doorlooptijd-per-fase (servicedesk).
--
-- Eén rij = één substatuswijziging. Geschreven bij handmatige wijziging
-- (updateServicedeskSubstatus) én wanneer de Bouw7-sync de substatus wijzigt
-- (syncProjects). De tijd-in-fase wordt afgeleid uit opeenvolgende events.

create table if not exists public.dossier_substatus_historie (
  id              uuid primary key default gen_random_uuid(),
  dossier_id      uuid not null references public.dossiers(id) on delete cascade,
  substatus       text not null,
  gewijzigd_op    timestamptz not null default now(),
  gewijzigd_door  uuid,
  bron            text not null default 'handmatig',  -- 'handmatig' | 'sync'
  created_at      timestamptz not null default now()
);

create index if not exists idx_dossier_substatus_historie_dossier
  on public.dossier_substatus_historie(dossier_id, gewijzigd_op);

comment on table public.dossier_substatus_historie is
  'Audittrail van substatuswijzigingen per dossier; basis voor doorlooptijd-per-fase.';

-- RLS-basislijn conform 20260616c.
alter table public.dossier_substatus_historie enable row level security;
drop policy if exists app_authenticated_all on public.dossier_substatus_historie;
create policy app_authenticated_all on public.dossier_substatus_historie
  for all to authenticated using (true) with check (true);
