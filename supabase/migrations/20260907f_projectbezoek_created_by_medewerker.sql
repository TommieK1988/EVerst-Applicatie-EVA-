-- ============================================================================
-- created_by op de projectbezoek-tabellen wijst naar medewerkers, niet naar auth.users.
--
-- 20260907c zette er een FK naar `auth.users` op. De code schrijft daar echter een
-- MEDEWERKER-id in: `vereisSessie()` geeft een medewerker terug, en zowel de
-- kwaliteits- als de opleveringsmodule zetten datzelfde id in hun `created_by`.
-- Gevolg: elke poging om een projectbezoek te starten viel om met
-- "violates foreign key constraint".
--
-- De FK gaat daarom naar `medewerkers`. Bewust NIET de FK weghalen — de omliggende
-- tabellen (`kwaliteit_inspecties.created_by`, `oplever_punten.created_by`) hebben er
-- helemaal geen, en dat is de reden dat die het verkeerde id ongemerkt accepteren.
-- Een verwijzing die klopt is beter dan geen verwijzing.
--
-- WAAROM DE ROOKTEST BIJ 20260907c DIT NIET VING: die insert liet `created_by` weg.
-- Een test die de kolom niet vult, test de kolom niet. Bij een volgende module hoort
-- de rooktest de insert te doen zoals de code hem doet, met alle velden.
--
-- Uitgevoerd op productie op 7 sep 2026, daarna geverifieerd met een insert die
-- `uitgevoerd_door` én `created_by` op een echt medewerker-id zet.
-- ============================================================================

alter table public.projectbezoeken
  drop constraint if exists projectbezoeken_created_by_fkey;
alter table public.projectbezoeken
  add constraint projectbezoeken_created_by_fkey
  foreign key (created_by) references public.medewerkers(id) on delete set null;

alter table public.projectbezoek_fotos
  drop constraint if exists projectbezoek_fotos_created_by_fkey;
alter table public.projectbezoek_fotos
  add constraint projectbezoek_fotos_created_by_fkey
  foreign key (created_by) references public.medewerkers(id) on delete set null;
