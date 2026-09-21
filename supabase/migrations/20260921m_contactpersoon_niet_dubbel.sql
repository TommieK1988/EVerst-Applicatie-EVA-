-- =====================================================================
-- Contactpersonen ontdubbelen: "beide behouden" vastleggen
-- =====================================================================
--
-- Zelfde verhaal als bij de relaties (`20260921a_relatie_niet_dubbel`): het dubbelenscherm
-- rekent zijn suggesties elke keer opnieuw uit, dus een groep die géén duplicaat is blijft
-- eeuwig staan. Er was maar één uitweg — "Dit is een postbus" — en die past alleen bij een
-- gedeeld mailadres. Twee échte naamgenoten bij twee opdrachtgevers (de `mogelijk`-laag:
-- "Zelfde naam, verder geen overeenkomst") kon je nergens kwijt.
--
-- Per páár, niet per groep: de groepssamenstelling verandert zodra er een contactpersoon
-- bijkomt of samengevoegd wordt, het oordeel "A is niet B" niet.

create table if not exists public.contactpersoon_niet_dubbel (
  id               uuid        primary key default gen_random_uuid(),
  -- Altijd de laagste uuid eerst, zodat (A,B) en (B,A) niet allebei kunnen bestaan.
  contactpersoon_a uuid        not null references public.contactpersonen(id) on delete cascade,
  contactpersoon_b uuid        not null references public.contactpersonen(id) on delete cascade,
  door             uuid        references auth.users(id),
  created_at       timestamptz not null default now(),
  constraint contactpersoon_niet_dubbel_volgorde check (contactpersoon_a < contactpersoon_b),
  constraint contactpersoon_niet_dubbel_paar unique (contactpersoon_a, contactpersoon_b)
);

create index if not exists contactpersoon_niet_dubbel_b_idx
  on public.contactpersoon_niet_dubbel (contactpersoon_b);

comment on table public.contactpersoon_niet_dubbel is
  'Contactpersoonparen die een mens heeft beoordeeld als twee verschillende mensen; het dubbelenscherm laat ze weg.';

alter table public.contactpersoon_niet_dubbel enable row level security;
-- Geen policies: uitsluitend server-side via de service-role admin-client, net als
-- contactpersoon_samenvoegingen. De rechtencheck zit in de server-action.
