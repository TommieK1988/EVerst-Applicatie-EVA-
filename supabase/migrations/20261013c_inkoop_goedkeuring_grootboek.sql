-- Inkoopfacturen: goedkeurder per grootboekrekening voor overhead (okt 2026).
--
-- Alleen voor facturen zonder projectleider, en alleen voor 4xxx-rekeningen (Tom). Het nummer geldt
-- in alle administraties: in Bouw7/Exact heeft "4400" per B.V. een eigen GUID, maar het is dezelfde
-- kostensoort. De vertaling GUID → nummer komt uit
-- GET /organization/general-ledger-accounts?branch={vestiging} (zie lib/bouw7/ENDPOINTS.md).

create table if not exists public.inkoop_goedkeur_grootboek (
  grootboek_nummer  text primary key check (grootboek_nummer ~ '^4[0-9]{3}$'),
  goedkeurder_id    uuid not null references public.medewerkers(id) on delete restrict,
  updated_at        timestamptz not null default now(),
  updated_by        uuid references public.medewerkers(id) on delete set null
);

comment on table public.inkoop_goedkeur_grootboek is
  'Goedkeurder per 4xxx-grootboekrekening, alleen voor inkoopfacturen zonder projectleider. Telt de rekening met het hoogste bedrag op de factuur.';

-- Het grootboek dat de route bepaalde, voor weergave en controle achteraf.
alter table public.inkoopfacturen
  add column if not exists grootboek_nummer text,
  add column if not exists grootboek_naam text;

alter table public.inkoop_goedkeur_stappen drop constraint if exists inkoop_goedkeur_stappen_soort_check;
alter table public.inkoop_goedkeur_stappen add constraint inkoop_goedkeur_stappen_soort_check
  check (soort in ('projectleider', 'grootboek', 'terugval', 'drempel'));

alter table public.inkoop_goedkeur_grootboek enable row level security;
drop policy if exists platform_gebruikers_all on public.inkoop_goedkeur_grootboek;
create policy platform_gebruikers_all on public.inkoop_goedkeur_grootboek
  for all to authenticated using (is_platform_gebruiker()) with check (is_platform_gebruiker());
