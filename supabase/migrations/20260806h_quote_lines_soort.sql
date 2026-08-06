-- Tekstregels op de offerte.
--
-- Tot nu toe was elke offerteregel een rekenregel: hoeveelheid × eenheidsprijs.
-- Een calculator die een toelichting tussen de posten wil zetten ("Prijzen zijn
-- inclusief steigerwerk", "Uitvoering in overleg met de bewoners") kon dat alleen
-- kwijt in de inleiding, de slottekst of als opmerking bij een bestaande regel —
-- nooit op een eigen plek in de opsomming.
--
-- `soort` maakt dat verschil expliciet:
--   null / 'post'  = gewone rekenregel (alle bestaande regels)
--   'tekst'        = tekstregel: alleen woorden, geen bedrag
--
-- Bewust nullable zonder default: bestaande regels blijven letterlijk zoals ze
-- zijn, en de code leest een lege waarde als 'post'.
--
-- Een tekstregel telt nergens in mee. De subtotalen per sectie en de BTW-
-- uitsplitsing slaan hem over (zie herbereken() in actions/quotes.ts), en hij
-- ontstaat alleen uit een calculatieregel die in EVA als tekstregel is gemarkeerd
-- — hij komt dus nooit in de werkbegroting of in de Bouw7-bestelregels terecht.

alter table public.quote_lines
  add column if not exists soort text;

alter table public.quote_lines
  drop constraint if exists quote_lines_soort_check;

alter table public.quote_lines
  add constraint quote_lines_soort_check
  check (soort is null or soort in ('post', 'tekst'));

comment on column public.quote_lines.soort is
  'Soort offerteregel: null/''post'' = rekenregel met bedrag, ''tekst'' = tekstregel zonder bedrag (telt niet mee in subtotalen of BTW).';
