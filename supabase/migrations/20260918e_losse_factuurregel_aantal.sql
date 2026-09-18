-- Aantal en eenheid op een losse factuurregel.
--
-- Een losse regel ('los:*') volgt uit geen enkele boeking en had daarom een vast "1 post": het
-- bedrag was het hele verhaal. Voor voorrijkosten klopt dat, voor "3 dagen keet" of "12 m² extra"
-- niet — dan hoort er op de factuur te staan waar het bedrag uit opgebouwd is, en dat is precies
-- wat de klant bij nacalculatie wil kunnen narekenen.
--
-- Leeg = zoals het altijd was: 1 post. Bestaande rijen veranderen dus niet.
--
-- Let op de betekenis van bedrag_excl_btw bij een losse regel: dat is vanaf nu de prijs per
-- eenheid, en het regeltotaal is aantal × die prijs. Bij het oude, impliciete aantal van 1 zijn die
-- twee hetzelfde, dus er valt niets te migreren. Bij afgeleide regels (uit boekingen) blijft
-- bedrag_excl_btw het vaste regeltotaal.

alter table public.factuur_regelgroepen
  add column if not exists aantal numeric(12,3),
  add column if not exists eenheid text;

comment on column public.factuur_regelgroepen.aantal is
  'Alleen bij losse regels (sleutel los:*): het aantal op de factuur. Leeg = 1.';
comment on column public.factuur_regelgroepen.eenheid is
  'Alleen bij losse regels (sleutel los:*): de eenheid achter het aantal (post, uur, stuks, m²). Leeg = post.';
comment on column public.factuur_regelgroepen.bedrag_excl_btw is
  'Bij een afgeleide regel: vast regeltotaal in plaats van de som van de boekingen. Bij een losse regel (los:*): de prijs per eenheid; het regeltotaal is aantal × die prijs.';
