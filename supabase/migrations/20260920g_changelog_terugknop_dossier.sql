-- Changelog-item voor de terugknop in een dossier (commit 3c9e58e3, CI groen).
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-20','opgelost','Commercieel','Terugknop in een dossier brengt je terug waar je vandaan kwam',
   'Opende je op je telefoon een dossier vanuit het klantbeeld of vanuit een contactpersoon, dan bracht de terugknop je naar de lijst met dossiers. Je raakte de klant waar je mee bezig was dus kwijt. Nu ga je netjes terug naar die klant of die contactpersoon, ook als je eerst nog door de tabbladen van het dossier hebt geklikt. Kwam je binnen via de dossierlijst, dan blijft de terugknop naar die lijst wijzen.');
