-- Losse factuurregels: kosten die niet uit een boeking volgen (opstartkosten, voorrijkosten).
--
-- Zo'n regel heeft geen uren of inkoopfactuur onder zich, dus er is ook niets om af te boeken zodra
-- hij gefactureerd is. Zonder een eigen markering zou hij bij elke volgende factuur opnieuw meegaan
-- — precies de dubbelfactuur-val die bij de bewakingscodes al een keer is dichtgezet. Vandaar dat
-- de groep zelf onthoudt op welke factuur hij terecht is gekomen.
--
-- Alleen groepen met sleutelprefix 'los:' bestaan zonder boekingen; de afgeleide groepen
-- ('alles', 'uur:*', 'kost:*', 'hand:*') houden hun afboeking in regie_factuurregels.

alter table public.factuur_regelgroepen
  add column if not exists bouw7_invoice_id text,
  add column if not exists gefactureerd_op timestamptz;

comment on column public.factuur_regelgroepen.bouw7_invoice_id is
  'Bouw7-factuur waar deze losse regel op terecht is gekomen. Gevuld = niet meer meenemen op een volgende factuur.';
comment on column public.factuur_regelgroepen.gefactureerd_op is
  'Moment waarop de losse regel is gefactureerd. Alleen van toepassing op groepen met sleutel los:*.';
