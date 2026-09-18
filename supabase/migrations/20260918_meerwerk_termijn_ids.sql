-- Meerwerk kan méér dan één termijn opleveren.
--
-- `zetMeerwerkAlsTermijn` zette tot nu toe precies één termijn in de Bouw7-termijnstaat, met het
-- hele meerwerkbedrag ineens. Zodra het meerwerk uit een eigen offerte komt, hoort het het
-- betalingsschema van díe offerte te volgen (bijv. 30/30/30/10). Dan zijn het vier termijnen, en
-- moeten ze bij een tweede akkoord of een gewijzigd bedrag alle vier bijgewerkt worden in plaats
-- van gedupliceerd.
--
-- `bouw7_term_id` blijft bestaan en houdt de éérste termijn vast: de cron en
-- `meerwerkTermijnGeschikt` gebruiken hem als "is er al een termijn gezet?"-vlag, en een oude rij
-- met één termijn blijft zo gewoon werken.

alter table public.meerwerk_regels
  add column if not exists bouw7_term_ids bigint[];

comment on column public.meerwerk_regels.bouw7_term_ids is
  'Alle Bouw7-termijn-ids van deze meerwerkregel, in schemavolgorde. Meer dan één zodra het meerwerk het betalingsschema van zijn eigen offerte volgt. bouw7_term_id is de eerste uit deze reeks.';
