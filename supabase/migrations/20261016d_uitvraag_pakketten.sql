-- Uitvragen vanuit de calculatie (calculatie fase 6).
--
-- Tot nu toe was een uitvraag één rij per partij in dossier_uitvragen, los van de calculatie.
-- Nu vraagt de calculator uit vanuit de posten zelf: één "pakket" (bijv. "Voegwerk gevel achter")
-- met nul of meer posten, uitgevraagd bij één of meer partijen.
--
--   dossier_uitvraag_pakketten   wat er wordt uitgevraagd (naam, reactie uiterlijk, projectbezoek)
--   dossier_uitvraag_posten      welke calculatieregels erbij horen, met een kopie van omschrijving,
--                                hoeveelheid en eenheid: regels leven in de calculatie-JSON en kunnen
--                                later wijzigen of verdwijnen; de uitvraag moet tonen wat er gevraagd is
--   dossier_uitvragen            blijft één rij per partij, nu met pakket_id, "rekent met" en de pdf
--
-- Alles toevoegend: bestaande uitvragen (pakket_id leeg) blijven werken in de tab Uitvraag.

create table if not exists public.dossier_uitvraag_pakketten (
  id                 uuid primary key default gen_random_uuid(),
  dossier_id         uuid not null references public.dossiers(id) on delete cascade,
  naam               text not null,
  soort              text not null default 'onderaannemer'
                       check (soort in ('onderaannemer','leverancier')),
  -- Calculatieversie (scenario-id uit de calculatie-JSON) waaruit de posten komen; leeg bij een losse uitvraag.
  scenario_id        text,
  reactie_uiterlijk  date,
  projectbezoek_op   timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid
);

create index if not exists idx_uitvraag_pakketten_dossier
  on public.dossier_uitvraag_pakketten (dossier_id, created_at);

create table if not exists public.dossier_uitvraag_posten (
  id                  uuid primary key default gen_random_uuid(),
  pakket_id           uuid not null references public.dossier_uitvraag_pakketten(id) on delete cascade,
  calculatieregel_id  text not null,
  omschrijving        text not null,
  hoeveelheid         numeric,
  eenheid             text,
  volgorde            int not null default 0
);

create index if not exists idx_uitvraag_posten_pakket
  on public.dossier_uitvraag_posten (pakket_id, volgorde);
create index if not exists idx_uitvraag_posten_regel
  on public.dossier_uitvraag_posten (calculatieregel_id);

alter table public.dossier_uitvragen
  add column if not exists pakket_id            uuid references public.dossier_uitvraag_pakketten(id) on delete cascade,
  add column if not exists rekent_mee           boolean not null default false,
  add column if not exists offerte_bestand_naam text,
  add column if not exists offerte_bestand_url  text;

create index if not exists idx_dossier_uitvragen_pakket
  on public.dossier_uitvragen (pakket_id);

-- Per pakket rekent de calculatie met hooguit één partij.
create unique index if not exists uq_dossier_uitvragen_rekent_mee
  on public.dossier_uitvragen (pakket_id) where rekent_mee;

comment on table public.dossier_uitvraag_pakketten is
  'Wat er wordt uitgevraagd: een naam, de reactietermijn en een optioneel projectbezoek. De partijen staan als rijen in dossier_uitvragen (pakket_id), de posten in dossier_uitvraag_posten. Zonder posten is het een losse uitvraag (bijv. een inmeter).';
comment on table public.dossier_uitvraag_posten is
  'Calculatieregels in een uitvraagpakket, met een kopie van omschrijving, hoeveelheid en eenheid zoals ze zijn uitgevraagd.';
comment on column public.dossier_uitvragen.rekent_mee is
  '"Rekent met": met deze partij rekent de calculatie. Dat is nog geen gunning; die volgt pas na klantakkoord, bij de inkoop. Hooguit één per pakket.';
comment on column public.dossier_uitvragen.offerte_bestand_url is
  'Link naar de ontvangen offerte (pdf) in de dossiermap (Bestanden).';

alter table public.dossier_uitvraag_pakketten enable row level security;
drop policy if exists platform_gebruikers_all on public.dossier_uitvraag_pakketten;
create policy platform_gebruikers_all on public.dossier_uitvraag_pakketten
  for all to authenticated
  using (public.is_platform_gebruiker()) with check (public.is_platform_gebruiker());

alter table public.dossier_uitvraag_posten enable row level security;
drop policy if exists platform_gebruikers_all on public.dossier_uitvraag_posten;
create policy platform_gebruikers_all on public.dossier_uitvraag_posten
  for all to authenticated
  using (public.is_platform_gebruiker()) with check (public.is_platform_gebruiker());
