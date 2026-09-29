-- Servicedeskbon vanaf de telefoon afronden.
--
-- 1. servicedesk_gereedmeldingen: de monteur meldt de bon gereed met wat hij heeft gedaan en,
--    eventueel een handtekening voor akkoord van wie er ter plekke is. Meerdere rijen per dossier mogelijk: een bon
--    die na een gereedmelding toch weer opengaat, wordt later opnieuw gemeld. De laatste telt;
--    de eerdere blijven als historie staan.
--
-- 2. dossier_pakbonnen: foto's van pakbonnen die de monteur op locatie of bij de groothandel
--    meekrijgt. De projectleider ziet zo welke inkoopfacturen er nog gaan komen, lang voordat de
--    factuur in Bouw7 binnen is.
--
-- Foto's en handtekeningen staan in een eigen publieke bucket `servicedesk-fotos` onder
-- `<dossier_id>/`. Niet in `werkbon-fotos`: die bucket waar de oude werkbonflow naar schrijft,
-- bestaat in dit project niet.

create table if not exists public.servicedesk_gereedmeldingen (
  id                         uuid         primary key default gen_random_uuid(),
  dossier_id                 uuid         not null references public.dossiers(id) on delete cascade,
  uitgevoerde_werkzaamheden  text         not null check (length(btrim(uitgevoerde_werkzaamheden)) > 0),
  handtekening_url           text,
  getekend_door              text,
  gemeld_door                uuid         references public.medewerkers(id) on delete set null,
  gemeld_op                  timestamptz  not null default now()
);

create index if not exists idx_servicedesk_gereedmeldingen_dossier
  on public.servicedesk_gereedmeldingen (dossier_id, gemeld_op desc);

comment on table public.servicedesk_gereedmeldingen is
  'Gereedmelding van een servicedeskbon vanaf mobiel: uitgevoerde werkzaamheden + optionele handtekening voor akkoord. Laatste rij per dossier telt.';

create table if not exists public.dossier_pakbonnen (
  id            uuid         primary key default gen_random_uuid(),
  dossier_id    uuid         not null references public.dossiers(id) on delete cascade,
  foto_url      text         not null,
  opmerking     text,
  geupload_door uuid         references public.medewerkers(id) on delete set null,
  geupload_op   timestamptz  not null default now()
);

create index if not exists idx_dossier_pakbonnen_dossier
  on public.dossier_pakbonnen (dossier_id, geupload_op desc);

comment on table public.dossier_pakbonnen is
  'Foto''s van pakbonnen die de buitendienst bij een dossier toevoegt, zodat de projectleider weet welke inkoopfacturen er verwacht worden.';

alter table public.servicedesk_gereedmeldingen enable row level security;
drop policy if exists servicedesk_gereedmeldingen_authenticated on public.servicedesk_gereedmeldingen;
create policy servicedesk_gereedmeldingen_authenticated
  on public.servicedesk_gereedmeldingen
  for all
  to authenticated
  using (true)
  with check (true);

alter table public.dossier_pakbonnen enable row level security;
drop policy if exists dossier_pakbonnen_authenticated on public.dossier_pakbonnen;
create policy dossier_pakbonnen_authenticated
  on public.dossier_pakbonnen
  for all
  to authenticated
  using (true)
  with check (true);

-- ── Storage-bucket (publiek, zoals oplever-fotos) ─────────────────────────────
insert into storage.buckets (id, name, public)
values ('servicedesk-fotos', 'servicedesk-fotos', true)
on conflict (id) do nothing;
