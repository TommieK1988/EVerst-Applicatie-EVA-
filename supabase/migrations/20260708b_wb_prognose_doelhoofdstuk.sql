-- Fix: prognose-doelhoofdstuk per dossier gedeeld maken (zelfde bug-klasse).
--
-- Het Bouw7-hoofdstuk waar de werkbegroting-prognose naartoe geschreven wordt,
-- stond in localStorage (`eva_prognose_hoofdstuk_${dossierId}`) → elke gebruiker/
-- elk apparaat koos zijn eigen doel; een tweede gebruiker viel terug op "WB".
-- Deze keuze is dossier-scoped en hoort gedeeld te zijn.

create table if not exists public.wb_prognose_instellingen (
  dossier_id        uuid primary key references public.dossiers(id) on delete cascade,
  doel_hoofdstuk_id bigint,
  bijgewerkt_op     timestamptz not null default now()
);

comment on table public.wb_prognose_instellingen is
  'Per dossier: het gekozen Bouw7-hoofdstuk waar de werkbegroting-prognose naartoe wordt geschreven. Vervangt de device-lokale localStorage-key eva_prognose_hoofdstuk_${dossierId} zodat de keuze gedeeld is.';

alter table public.wb_prognose_instellingen enable row level security;
drop policy if exists app_authenticated_all on public.wb_prognose_instellingen;
create policy app_authenticated_all on public.wb_prognose_instellingen
  for all to authenticated using (true) with check (true);
