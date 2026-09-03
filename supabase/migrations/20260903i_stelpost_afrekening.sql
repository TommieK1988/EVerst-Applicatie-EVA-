-- Stelposten in de opdracht afrekenen op eenheidsprijzen, en met een instelbare opslag.
--
-- Tot nu toe kon een stelpost uit `opdracht_onderdelen` maar op twee manieren afrekenen: een vast
-- bedrag (er valt niets te verrekenen) of op geboekte kosten. In de praktijk komt de derde vorm net
-- zo vaak voor: een afgesproken eenheidsprijs maal de hoeveelheid die werkelijk is uitgevoerd
-- (aantal m², aantal kozijnen, aantal woningen). Die vorm bestond al voor stelposten die als
-- meerwerk zijn vastgelegd (`meerwerk_regels.stelpost_grondslag = 'eenheidsprijzen'`), maar niet
-- voor stelposten die in de opdracht zitten.
--
-- De veldnamen zijn bewust gelijk aan die op `meerwerk_regels`, zodat de twee stelpost-mechanismen
-- dezelfde taal spreken en `effectiefExcl()` en `verrekenStelpost()` dezelfde rekenregel gebruiken.
--
--   • eenheid              — 'm²', 'stuks', 'woning'; puur label, geen rekenwaarde.
--   • eenheidsprijs        — afgesproken verkoopprijs per eenheid, excl. btw.
--   • hoeveelheid_werkelijk— wat er werkelijk is uitgevoerd. Handmatig ingevuld: Bouw7 kent deze
--                            hoeveelheid niet, en hem uit de geboekte kosten afleiden zou precies
--                            de eenheidsprijs-afspraak omzeilen die de klant is toegezegd.
--   • opslag_pct           — opslag op geboekte kosten voor DEZE stelpost. Leeg = de
--                            bedrijfsstandaard (bedrijfsinstellingen.overige.regie_opslag_pct,
--                            met 25 als terugval). Stond eerder als constante in de code.
--
-- Let op: `bedrag_excl_btw` blijft het AFGESPROKEN stelpostbedrag, ook bij eenheidsprijzen. Dat is
-- het bedrag waarop de carve-out-controle rekent en waartegen het werkelijke bedrag wordt
-- afgezet; de verrekening boekt alleen het verschil.

alter table public.opdracht_onderdelen
  add column if not exists eenheid text,
  add column if not exists eenheidsprijs numeric(12,4),
  add column if not exists hoeveelheid_werkelijk numeric(12,4),
  add column if not exists opslag_pct numeric(6,2);

-- De check op `grondslag` uitbreiden met de derde vorm. `if exists` omdat de constraint in
-- 20260730 zonder expliciete naam is aangemaakt en Postgres hem dan zelf benoemt.
alter table public.opdracht_onderdelen
  drop constraint if exists opdracht_onderdelen_grondslag_check;

alter table public.opdracht_onderdelen
  add constraint opdracht_onderdelen_grondslag_check
  check (grondslag is null or grondslag in ('vast', 'geboekte_kosten', 'eenheidsprijzen'));

comment on column public.opdracht_onderdelen.eenheidsprijs is
  'Afgesproken verkoopprijs per eenheid (excl. btw) bij grondslag ''eenheidsprijzen''. Het afrekenbedrag is eenheidsprijs x hoeveelheid_werkelijk.';
comment on column public.opdracht_onderdelen.hoeveelheid_werkelijk is
  'Werkelijk uitgevoerde hoeveelheid, handmatig vastgelegd. Bewust niet uit Bouw7 afgeleid: bij een eenheidsprijs-afspraak zijn de geboekte kosten niet de grondslag.';
comment on column public.opdracht_onderdelen.opslag_pct is
  'Opslag in procenten op de geboekte kosten van deze stelpost. Leeg = bedrijfsstandaard (bedrijfsinstellingen.overige.regie_opslag_pct, terugval 25).';
