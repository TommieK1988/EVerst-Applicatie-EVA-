-- Factuurregels: totaal = aantal × prijs per eenheid, tenzij het totaal hard is ingevuld.
--
-- Tot nu toe was `bedrag_excl_btw` bij een afgeleide regel het regeltotaal en bij een losse regel
-- de prijs per eenheid. Nu krijgt de prijs een eigen kolom, voor elke regel:
--   stukprijs        ingevulde prijs per eenheid; leeg = uit de boekingen (losse regel: 0)
--   bedrag_excl_btw  hard ingevuld regeltotaal; leeg = aantal × stukprijs
--
-- Losse regels verhuizen hun prijs van `bedrag_excl_btw` naar `stukprijs`, zodat hun totaal
-- hetzelfde blijft.

alter table public.factuur_regelgroepen
  add column if not exists stukprijs numeric(12, 2);

update public.factuur_regelgroepen
   set stukprijs = bedrag_excl_btw,
       bedrag_excl_btw = null,
       updated_at = now()
 where groep_sleutel like 'los:%'
   and bedrag_excl_btw is not null
   and stukprijs is null;

comment on column public.factuur_regelgroepen.stukprijs is
  'Ingevulde prijs per eenheid. Leeg = afgeleid uit de boekingen (som ÷ geboekt aantal); bij een losse regel 0.';
comment on column public.factuur_regelgroepen.bedrag_excl_btw is
  'Hard ingevuld regeltotaal excl. btw. Leeg = aantal × stukprijs.';
