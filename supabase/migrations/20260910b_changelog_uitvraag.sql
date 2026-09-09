-- Changelog-item voor de Uitvraag-module. Pas toegevoegd nadat de code op main stond:
-- de changelog-tabel staat in het gedeelde productie-Supabase en toont elk gepubliceerd item
-- meteen aan iedereen.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-09','nieuw','Dossiers','Bijhouden waar je offertes hebt opgevraagd',
   'Op een dossier staat nu het tabblad Uitvraag: leg per onderdeel vast bij welke onderaannemer of leverancier je een prijs hebt opgevraagd, en wanneer die binnenkwam. Je stelt de aanvraag direct vanuit EVA op — de contactpersonen van die partij staan al klaar in de ontvangerkiezer — en de datum wordt automatisch ingevuld zodra de mail weg is. Op de Aanvragen-pagina zie je met de knop "Openstaand extern" over alle dossiers heen wat er nog bij externe partijen ligt, en stuur je ze in één keer een herinnering: één mail per partij met al hun openstaande aanvragen bij elkaar.');
