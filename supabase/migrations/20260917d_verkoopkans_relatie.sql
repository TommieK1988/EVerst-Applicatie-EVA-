-- Een verkoopkans hoort bij een klant, ook zonder dossier.
--
-- Bij de eerste versie kwam de klant altijd uit het brondossier: de kans ontstond nu eenmaal
-- bij het afsluiten van een offerte. Maar een kans mag ook los beginnen ("beheerder noemde
-- terloops dat complex Noord in 2028 aan de beurt is"), en dan is er geen dossier en dus geen
-- klant — terwijl juist de klant bepaalt wie je belt.
--
-- Vandaar een eigen verwijzing. Hij is los van `bron_dossier_id` omdat de twee verschillende
-- vragen beantwoorden: het dossier zegt *waar de kans vandaan komt*, de relatie zegt *bij wie
-- het werk zit*. Meestal dezelfde partij, maar niet altijd — een VvE-beheerder verandert, een
-- kans verhuist naar de rechtsopvolger.

alter table public.commercie_bewaking
  add column if not exists relatie_id uuid references public.relaties(id) on delete set null;

comment on column public.commercie_bewaking.relatie_id is
  'De klant/opdrachtgever van een verkoopkans. Staat los van bron_dossier_id: een kans kan zonder dossier bestaan, en de klant kan van het brondossier afwijken.';

create index if not exists commercie_bewaking_relatie_idx
  on public.commercie_bewaking (relatie_id) where relatie_id is not null;
