-- Werkplan bij een opdracht-dossier.
--
-- De uitvoering wil op één plek zien wat er op een werk van hen verwacht wordt: wat het werk is,
-- hoe de bouwplaats bereikbaar is, en welke afspraken er gelden voor werktijden, reisuren,
-- reiskosten, parkeren en kleuren/materialen. Werkvoorbereiding vult het in, de uitvoering leest
-- het in EVA en op de telefoon.
--
-- Eén rij per dossier, dus dossier_id is de sleutel. De werkafspraken zijn elk één keuze uit een
-- vaste lijst (de standaardzinnen staan in de code, werkplan-types.ts) met hooguit één invulwaarde
-- erbij. De vertrektijd is bewust text ('HH:MM') en geen `time`: Postgres geeft `time` terug als
-- 'HH:MM:SS', wat een HH:MM-validatie bij het opnieuw opslaan breekt.

create table if not exists public.dossier_werkplannen (
  dossier_id            uuid primary key references public.dossiers(id) on delete cascade,
  -- Eén tekstveld met de kopjes Werkzaamheden, Bereikbaarheid, Bouwplaats, Voorzieningen, Reclame.
  werkomschrijving      text not null,

  werktijden_keuze      text not null default 'geen',
  werktijden_anders     text,

  reisuren_keuze        text not null default 'geen',
  reisuren_uren         numeric,
  reisuren_vertrektijd  text,
  reisuren_anders       text,

  reiskosten_keuze      text not null default 'geen',
  reiskosten_km         numeric,

  parkeren_keuze        text not null default 'gratis',
  parkeren_max_per_dag  numeric,
  parkeren_anders       text,

  -- [{ "onderdeel": "Kozijnen buiten", "waarde": "RAL 9010" }, …]
  kleuren_materialen    jsonb not null default '[]'::jsonb,

  bijgewerkt_op         timestamptz not null default now(),
  bijgewerkt_door       uuid,

  constraint dossier_werkplannen_werktijden_keuze check (werktijden_keuze in ('geen','anders')),
  constraint dossier_werkplannen_reisuren_keuze   check (reisuren_keuze in ('geen','buiten_productief','binnen_productief','anders')),
  constraint dossier_werkplannen_reiskosten_keuze check (reiskosten_keuze in ('geen','vergoeding')),
  constraint dossier_werkplannen_parkeren_keuze   check (parkeren_keuze in ('gratis','zelf_betalen','declareren','anders')),
  constraint dossier_werkplannen_vertrektijd      check (reisuren_vertrektijd is null or reisuren_vertrektijd ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  constraint dossier_werkplannen_kleuren_array    check (jsonb_typeof(kleuren_materialen) = 'array')
);

comment on table public.dossier_werkplannen is
  'Werkplan per opdracht-dossier voor de uitvoering: werkomschrijving, werkafspraken (werktijden, reisuren, reiskosten, parkeren) en kleuren/materialen.';

-- Lezen mag elke platformgebruiker (ook de monteur op /m); muteren alleen via server actions op de
-- service role. Subquery-vorm tegen de initplan-valkuil.
alter table public.dossier_werkplannen enable row level security;

drop policy if exists dossier_werkplannen_select on public.dossier_werkplannen;
create policy dossier_werkplannen_select
  on public.dossier_werkplannen
  for select
  to authenticated
  using ((select public.is_platform_gebruiker()));
