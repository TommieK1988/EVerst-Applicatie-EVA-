-- Contactpersonen koppelen aan een factuuradres.
--
-- Een factuuradres is niet altijd "de post van het bedrijf". Bij een VvE hangt het adres aan een
-- bestuur (de voorzitter tekent, de penningmeester betaalt), en bij een vastgoedbeheerder hoort
-- bij elke portefeuille een eigen assetmanager. Wie je daarvoor moet hebben stond tot nu toe
-- hooguit in het opmerkingenveld.
--
-- Bewust een eigen koppeltabel en geen kolom op `relatie_factuuradressen`: er zijn er vaak meer
-- dan één per adres, en dezelfde persoon kan bij meerdere adressen horen. Dezelfde vorm als
-- `contactpersoon_organisaties`, zodat de persoon één rij in EVA blijft.

create table if not exists public.contactpersoon_factuuradressen (
  id                uuid primary key default gen_random_uuid(),
  contactpersoon_id uuid not null references public.contactpersonen(id)          on delete cascade,
  factuuradres_id   uuid not null references public.relatie_factuuradressen(id)  on delete cascade,
  -- Rol bij dít adres: Voorzitter, Penningmeester, Assetmanager, Beheerder…
  rol               text,
  -- Het eerste aanspreekpunt voor dit adres; hooguit één per adres.
  is_primair        boolean not null default false,
  opmerkingen       text,
  created_at        timestamptz not null default now(),
  created_by        uuid,
  unique (contactpersoon_id, factuuradres_id)
);

comment on table public.contactpersoon_factuuradressen is
  'Welke contactpersonen horen bij een factuuradres — de VvE-voorzitter, de assetmanager van een portefeuille. Los van contactpersoon_organisaties: dat is de werkgever, dit is het adres.';

create index if not exists contactpersoon_factuuradressen_adres_idx
  on public.contactpersoon_factuuradressen (factuuradres_id);

create index if not exists contactpersoon_factuuradressen_persoon_idx
  on public.contactpersoon_factuuradressen (contactpersoon_id);

-- Hooguit één primair aanspreekpunt per adres.
create unique index if not exists contactpersoon_factuuradressen_een_primair
  on public.contactpersoon_factuuradressen (factuuradres_id) where is_primair;

-- Zelfde afscherming als `contactpersonen` en `contactpersoon_emails`: lezen mag een ingelogde
-- platformgebruiker, muteren gaat uitsluitend via server actions op de service role. De
-- subquery-vorm `(select is_platform_gebruiker())` is bewust: zo evalueert Postgres de functie
-- één keer per query in plaats van per rij (de initplan-valkuil uit de RLS-hardening).
alter table public.contactpersoon_factuuradressen enable row level security;

drop policy if exists contactpersoon_factuuradressen_select on public.contactpersoon_factuuradressen;
create policy contactpersoon_factuuradressen_select
  on public.contactpersoon_factuuradressen
  for select
  to authenticated
  using ((select public.is_platform_gebruiker()));
