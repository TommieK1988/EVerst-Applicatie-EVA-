-- Betrokkenen bij een dossier.
--
-- Rond een opdracht staan meer mensen dan de ene contactpersoon van de opdrachtgever: een
-- VvE-bestuur, de assetmanager van de portefeuille, een architect, een opzichter namens de
-- woningcorporatie, de beheerder die de sleutels heeft. Die stonden tot nu toe verspreid — in het
-- opmerkingenveld, in een mail, of helemaal nergens — terwijl je ze juist bij de hand wilt hebben
-- als je over de opdracht belt.
--
-- Een rij kan een persoon zijn, een organisatie, of allebei ("Jan de Vries namens Bureau X").
-- Vandaar twee nullable verwijzingen met een check dat er minstens één gevuld is, in plaats van
-- twee aparte tabellen: in de lijst op het scherm staan ze door elkaar en hebben ze dezelfde rol
-- en dezelfde knoppen.
--
-- Wat híér staat is alleen wat een mens handmatig toevoegt. De contactpersoon van het dossier en
-- de personen bij het gekozen factuuradres komen uit hun eigen bron en worden in het scherm
-- samengevoegd; die kopiëren zou ze laten verlopen zodra de bron verandert.

create table if not exists public.dossier_betrokkenen (
  id                uuid primary key default gen_random_uuid(),
  dossier_id        uuid not null references public.dossiers(id)         on delete cascade,
  relatie_id        uuid          references public.relaties(id)         on delete cascade,
  contactpersoon_id uuid          references public.contactpersonen(id)  on delete cascade,
  -- Rol bij déze opdracht: Architect, Opzichter, VvE-voorzitter, Beheerder…
  rol               text,
  opmerkingen       text,
  created_at        timestamptz not null default now(),
  created_by        uuid,
  constraint dossier_betrokkenen_persoon_of_relatie
    check (relatie_id is not null or contactpersoon_id is not null)
);

comment on table public.dossier_betrokkenen is
  'Handmatig toegevoegde betrokkenen bij een dossier: personen en/of organisaties met hun rol bij deze opdracht. De contactpersoon van het dossier en de personen bij het factuuradres staan hier NIET in; die komen uit hun eigen bron.';

create index if not exists dossier_betrokkenen_dossier_idx
  on public.dossier_betrokkenen (dossier_id);

create index if not exists dossier_betrokkenen_contactpersoon_idx
  on public.dossier_betrokkenen (contactpersoon_id)
  where contactpersoon_id is not null;

-- Dezelfde persoon hooguit één keer per dossier.
create unique index if not exists dossier_betrokkenen_persoon_uniek
  on public.dossier_betrokkenen (dossier_id, contactpersoon_id)
  where contactpersoon_id is not null;

-- En een organisatie-zonder-persoon hooguit één keer per dossier. Een organisatie mag wél vaker
-- voorkomen zolang er verschillende personen bij staan — twee mensen van hetzelfde bureau.
create unique index if not exists dossier_betrokkenen_relatie_uniek
  on public.dossier_betrokkenen (dossier_id, relatie_id)
  where contactpersoon_id is null and relatie_id is not null;

-- Zelfde afscherming als de overige contactpersoontabellen: lezen mag een ingelogde
-- platformgebruiker, muteren gaat uitsluitend via server actions op de service role. De
-- subquery-vorm `(select is_platform_gebruiker())` is bewust: zo evalueert Postgres de functie
-- één keer per query in plaats van per rij (de initplan-valkuil uit de RLS-hardening).
alter table public.dossier_betrokkenen enable row level security;

drop policy if exists dossier_betrokkenen_select on public.dossier_betrokkenen;
create policy dossier_betrokkenen_select
  on public.dossier_betrokkenen
  for select
  to authenticated
  using ((select public.is_platform_gebruiker()));
