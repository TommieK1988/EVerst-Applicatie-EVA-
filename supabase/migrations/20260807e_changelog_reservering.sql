-- Changelog: reservering (was winkelbudget) + dossiergegevens terug in de inkoopmail
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-08-07','nieuw','Inkoop','Reservering: budget vastleggen zonder opdracht te sturen',
   'De knop "Winkel" bij materiaal heet nu "Reservering" en zit ook op onderaanneming. Gebruik hem voor kosten waar je geen order of opdracht voor verstuurt — een budgetpot bij de bouwmarkt, transport, een chemisch toilet. EVA legt één bedrag vast in Bouw7 en roept het meteen af, zodat de inkoopfactuur er straks op kan afboeken. Er gaat niets naar de leverancier of onderaannemer toe.'),
  ('2026-08-07','opgelost','Inkoop','Projectgegevens stonden niet in de order-mail',
   'In de mail bij een inkooporder of opdracht bleven het projectnummer, de projectnaam en het werkadres leeg, en ontbrak het dossiernummer in de bestandsnaam van de bijlage. Die gegevens worden weer ingevuld.');
