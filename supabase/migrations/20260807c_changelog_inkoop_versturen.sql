-- Changelog: inkooporder/opdracht versturen liep vast + opmaak achteraf te wisselen
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-08-07','opgelost','Inkoop','Bestelling of opdracht versturen lukt weer',
   'Het versturen van een inkooporder of opdracht liep vast op de melding "Deze bestelling hoort niet bij dit dossier". Dat is verholpen: het document wordt weer gewoon opgesteld, ook het voorbeeld vooraf.'),
  ('2026-08-07','verbeterd','Inkoop','Opmaak van een order of opdracht achteraf wisselen',
   'Bij een klaargezette inkoop kies je nu ook ná het aanmaken nog welk sjabloon de opmaak levert, met een voorbeeldknop ernaast. Voorheen lag die keuze vast zodra de order was aangemaakt.');
