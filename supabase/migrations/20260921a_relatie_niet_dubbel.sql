-- =====================================================================
-- Relaties ontdubbelen: "beide behouden" vastleggen
-- =====================================================================
--
-- Het dubbelenscherm rekent zijn suggesties elke keer opnieuw uit (zelfde KvK, zelfde naam,
-- gelijkende naam op hetzelfde adres). Dat is bewust — nieuwe Bouw7-rijen moeten er vanzelf
-- in verschijnen. Maar het heeft één gat: een groep die géén duplicaat is, blijft eeuwig in
-- de lijst staan. Er is niets om "deze twee horen los" in op te slaan.
--
-- Dat is geen theoretisch geval. Bij de opschoning van 20 september 2026 bleven er zes
-- groepen bewust staan: Nationaal Grondbezit vs. Nationaal Grondbezit B.V. (andere stad),
-- Den Dulk Afbouw vs. Den Dulk Brandwerend (gedeeld KvK, twee handelsnamen), VvE
-- Von Geusaustraat (mag expliciet niet samen), Hospice Het Vliethuys vs. Vrienden van
-- Hospice. Die staan nu bij elke gebruiker opnieuw als openstaand werk in beeld, en zo leert
-- iedereen het scherm te negeren.
--
-- Vandaar deze tabel: een paar relaties dat door een mens is beoordeeld als "niet hetzelfde
-- bedrijf". Per páár, niet per groep — de groepssamenstelling wisselt zodra er een relatie
-- bijkomt of samengevoegd wordt, maar het oordeel "A is niet B" blijft gelden.
--
-- Terug te draaien: een rij weghalen zet de groep gewoon weer in de suggestielijst.

create table if not exists public.relatie_niet_dubbel (
  id         uuid        primary key default gen_random_uuid(),
  -- Altijd de laagste uuid eerst, zodat (A,B) en (B,A) niet allebei kunnen bestaan en de
  -- unique index het paar echt afdekt.
  relatie_a  uuid        not null references public.relaties(id) on delete cascade,
  relatie_b  uuid        not null references public.relaties(id) on delete cascade,
  door       uuid        references auth.users(id),
  created_at timestamptz not null default now(),
  constraint relatie_niet_dubbel_volgorde check (relatie_a < relatie_b),
  constraint relatie_niet_dubbel_paar unique (relatie_a, relatie_b)
);

create index if not exists relatie_niet_dubbel_b_idx
  on public.relatie_niet_dubbel (relatie_b);

comment on table public.relatie_niet_dubbel is
  'Relatieparen die een mens heeft beoordeeld als niet-hetzelfde-bedrijf; het dubbelenscherm laat ze weg.';

alter table public.relatie_niet_dubbel enable row level security;
-- Geen policies: uitsluitend server-side via de service-role admin-client, net als
-- relatie_samenvoegingen en relatie_bouw7_koppelingen. De rechtencheck zit in de server-action.
