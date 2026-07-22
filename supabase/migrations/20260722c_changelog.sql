insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-07-22','opgelost','Calculatie','Werkbegroting laat nu wel zien dat hij goedgekeurd is',
   'De knop bovenin de werkbegroting bleef "Ter beoordeling" tonen terwijl de begroting allang was goedgekeurd. Alleen de collega die zelf op accorderen klikte zag de juiste stand. De knop en het statuslabel volgen nu de echte goedkeuring, dus iedereen ziet direct of een werkbegroting is goedgekeurd, teruggestuurd, of na de goedkeuring nog gewijzigd is.'),
  ('2026-07-22','verbeterd','Calculatie','Totalen naast de werkbegroting zijn beter leesbaar',
   'Het totalenblok aan de rechterkant van de werkbegroting was te smal: bedragen vielen over meerdere regels en namen van uurtypes en leveranciers werden vroeg afgekapt. Het blok is breder gemaakt zodat alles in een oogopslag leesbaar is.');
