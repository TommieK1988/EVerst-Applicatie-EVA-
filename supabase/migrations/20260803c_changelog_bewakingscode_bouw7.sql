-- Changelog-item: hercoderen van een geboekte kost gaat nu ook naar Bouw7.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-08-03','verbeterd','Financieel','Kosten op een andere bewakingscode zetten werkt nu ook in Bouw7',
   'Zet je op het tabblad Inkoop een geboekte kost op een andere bewakingscode, dan wordt die wijziging nu ook in Bouw7 doorgevoerd. Het tabblad Financieel en de projectbewaking in Bouw7 laten daardoor meteen hetzelfde zien als jouw correctie. Staat de code nog niet klaar voor die soort kosten, dan zet EVA hem er zelf bij. Kosten die aan een inkooporder of onderaannemerscontract hangen blijven staan: daar bepaalt het contract de code.');
