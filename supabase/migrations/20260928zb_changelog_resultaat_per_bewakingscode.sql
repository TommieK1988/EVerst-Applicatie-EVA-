-- Changelog: verwacht resultaat per bewakingscode op het Financieel-tab.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-28','nieuw','Financieel','Verwacht resultaat per bewakingscode',
   'Op het tabblad Financieel zie je nu per stelpost, meerwerk en regie wat het naar verwachting oplevert: verkoop, kosten, resultaat en marge. Alle overige werkzaamheden staan samen tegen de aanneemsom, zodat het totaal het verwachte resultaat van het hele project is.');
