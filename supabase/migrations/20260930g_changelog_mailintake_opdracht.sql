-- Changelog: opdrachten op onze eigen offerte worden herkend.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-30','verbeterd','Mailintake','Een opdracht op onze eigen offerte wordt herkend',
   'Stuurt een opdrachtgever een opdracht met ons offertenummer erbij, dan zoekt EVA nu zelf het '
   || 'bijbehorende dossier op en biedt aan de offerte op gewonnen te zetten. Staat dat dossier nog '
   || 'in de aanvraagfase terwijl de offerte al verzonden is, dan zet EVA het eerst op Offerte '
   || 'verzonden. Ook het inkoopordernummer en de naam waarop de factuur moet staan worden nu '
   || 'overgenomen — die bleven eerder liggen.');
