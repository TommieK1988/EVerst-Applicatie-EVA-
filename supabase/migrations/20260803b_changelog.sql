-- Changelog: dossiers openen in een eigen tabblad, met de dossiernaam in de
-- tabtitel en een skelet in plaats van een wachttijd. Reeds live toegepast op
-- 2026-08-03 via de Supabase MCP; dit bestand is de repo-registratie
-- ("items zijn altijd data").
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-08-03','verbeterd','Dossiers','Een dossier opent in een eigen tabblad',
   'Klik je een dossier aan — op het bord, in de lijst, vanuit de zoeker, je acties, de planning of het relatiedossier — dan opent het voortaan in een nieuw browsertabblad. Je overzicht blijft daardoor staan, met je filters, sortering en scrollpositie, en je kunt meerdere dossiers naast elkaar openhouden. In de titel van het tabblad staat de naam van het dossier, zodat je ze uit elkaar houdt. En het dossier verschijnt meteen in beeld: waar je eerst even naar het oude scherm bleef kijken, zie je nu direct de opbouw van de pagina terwijl de gegevens inladen.');
