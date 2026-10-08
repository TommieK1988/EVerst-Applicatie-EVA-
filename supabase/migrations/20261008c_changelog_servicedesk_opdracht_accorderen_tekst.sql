-- Het item van 20261008a beschreef de eerste versie (accordering via de werkbegroting).
-- Sinds a6d194ed wordt de opdracht zelf geaccordeerd, op de bon. Zelfde functie, zelfde dag:
-- de tekst bijwerken in plaats van een tweede item.
update public.changelog
set omschrijving = 'Een opdracht aan een onderaannemer of leverancier boven het accorderingsbedrag liep op een servicedeskbon vast. Nu vraag je vanuit het venster accordering aan voor die ene opdracht. De opdracht staat op de bon onder "Opdrachten in de wacht"; daar keurt de controller hem goed of stuurt hem terug, en daarna maak en verstuur je hem zonder alles opnieuw in te vullen.'
where datum = '2026-10-08'
  and module = 'Servicedesk'
  and titel = 'Opdracht boven de drempel accorderen vanaf de bon';
