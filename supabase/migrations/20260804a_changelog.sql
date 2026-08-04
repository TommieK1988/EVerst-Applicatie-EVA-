-- Changelog: groepen verslepen in de structuurboom in plaats van het rekenblad.
-- Reeds live toegepast op 2026-08-04 via de Supabase MCP; dit bestand is de
-- repo-registratie ("items zijn altijd data").
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-08-04','verbeterd','Calculatie','Groepen verslepen in de structuurboom',
   'Het verplaatsen van groepen is verhuisd van het rekenblad naar het Structuur-paneel, waar elke regel een groep is en je de opbouw in één oogopslag ziet. Pak een groep bij de greep links vast en sleep hem. Laat je los op een strook tussen twee groepen, dan komt hij daartussen; laat je los op een groep, dan komt hij daarin als laatste. Bovenin het paneel staat steeds wat er gaat gebeuren, bijvoorbeeld "vóór Afplakken, niveau 2". Kan iets niet, dan zie je meteen waarom. Het niveau volgt vanzelf uit de plek waar je loslaat, dus je hoeft niet meer zijwaarts te mikken om een groep in of uit te laten springen. Het paneel is bovendien breder geworden, zodat lange groepsnamen volledig passen.');
