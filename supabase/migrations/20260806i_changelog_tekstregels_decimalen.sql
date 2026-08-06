-- Changelog-items voor de tekstregels en de bedragen met twee decimalen.

insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-08-06','nieuw','Calculatie','Tekstregels tussen de posten',
   'In het rekenblad staat naast "Regel" nu ook een knop "Tekst". Daarmee zet je een losse tekstregel tussen de posten — bijvoorbeeld een toelichting of een afspraak — die je net als een gewone regel kunt verslepen naar de juiste plek. De regel telt nergens in mee en komt niet in de werkbegroting, maar verschijnt wel op diezelfde plek in de offerte, zonder aantal en zonder bedrag.'),
  ('2026-08-06','opgelost','Offerte','Bedragen altijd met twee decimalen',
   'Ronde bedragen lieten de centen weg, waardoor er "€ 10.000" naast "€ 131,25" in dezelfde kolom kon staan. Alle bedragen in de offerte staan nu netjes op de cent onder elkaar.');
