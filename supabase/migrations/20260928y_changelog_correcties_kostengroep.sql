-- Changelog: kostengroep Correcties in de werkbegroting.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-28','nieuw','Werkbegroting','Correcties voor kloppende maandcijfers',
   'In de werkbegroting kun je met "Correcties toevoegen" een aparte kostengroep aanmaken om de prognose van een project bij te stellen, in bedragen en uren, ook negatief. Zo kloppen de maandcijfers zonder dat je het urenbudget van de uitvoering hoeft aan te passen. De uitvoering ziet deze groep nergens: niet in de planning, niet bij uren boeken en niet in het urensaldo. Zichtbaar voor Projectbureau en Administratie.');
