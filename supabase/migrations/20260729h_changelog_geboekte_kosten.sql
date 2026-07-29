insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-07-29','opgelost','Financieel','Geboekte kosten telden dubbel bij herhaalde bewakingscode',
   'In de bewakingstabel op het Financieel-tab werden geboekte inkoopkosten te hoog opgeteld wanneer dezelfde bewakingscode in meerdere hoofdstukken voorkwam. Het totaal klopt nu weer met de werkelijk geboekte kosten.');
