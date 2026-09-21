-- Eén opgemaakt tekstblok op de offerte, in plaats van drie losse velden.
--
-- Voorwaarden, Uitsluitingen en Opmerkingen waren drie aparte tekstvakken die in het
-- Word-sjabloon ook op drie losse plekken stonden. In de praktijk schrijft een calculator
-- één lopend verhaal en wil hij daarin kunnen opmaken — vet, bullets. Dat past niet in
-- drie gescheiden vakken met platte tekst.
--
-- De inhoud blijft in `quote_terms` wonen: die tabel cascadeert al met de offerte en
-- wordt bij het reviseren al meegekopieerd. Er komt alleen een vierde soort bij. De drie
-- oude soorten blijven toegestaan, zodat de 60 bestaande offertes leesbaar blijven; de
-- render zet ze om naar één blok wanneer er nog geen `offerteteksten`-rij is.
--
-- De inhoud is HTML (dezelfde subset als de editor levert: p, strong, em, u, ul/ol/li,
-- br). De Word-render zet die om naar OOXML voor de tag {@offerteteksten}.

alter table public.quote_terms drop constraint if exists quote_terms_type_check;

alter table public.quote_terms add constraint quote_terms_type_check
  check (type = any (array[
    'voorwaarden'::text,
    'uitsluitingen'::text,
    'opmerkingen'::text,
    'offerteteksten'::text
  ]));

comment on column public.quote_terms.type is
  'offerteteksten = het opgemaakte tekstblok (HTML) van nieuwe offertes. voorwaarden/uitsluitingen/opmerkingen zijn de drie losse velden van vóór september 2026; die worden niet meer geschreven, alleen nog gelezen.';
