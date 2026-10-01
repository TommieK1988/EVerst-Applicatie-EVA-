insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-10-01','opgelost','Financieel','"Al gefactureerd" klopt nu ook bij een vast regelbedrag',
   'Zet je bij een servicedeskfactuur een vast bedrag op een regel, dan toonde "Al gefactureerd" daarna het berekende bedrag in plaats van wat er echt op de factuur stond. Nu wordt het vaste bedrag onthouden, zodat het overzicht gelijkloopt met de factuur. Facturen van vóór vandaag tonen nog het berekende bedrag.');
