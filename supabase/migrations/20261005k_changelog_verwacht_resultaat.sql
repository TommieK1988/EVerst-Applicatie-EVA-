-- Financieel-tab: verwacht resultaat per post, prognose uit de werkbegroting.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-10-05','verbeterd','Financieel','Verwacht resultaat per stelpost en meerwerkregel',
   'Op het tabblad Financieel zie je nu het verwachte resultaat van de hoofdaanneemsom, elke stelpost en elke meerwerkregel apart, met subtotalen voor aanneemsom, stelposten en meerwerk. De prognose komt uit de werkbegroting, en een stelpost telt mee voor het afgesproken bedrag.');
