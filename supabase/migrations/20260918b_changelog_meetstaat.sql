-- Wat is nieuw: uitbreiding van de meetstaat in de calculatie.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-18','verbeterd','Calculatie','Sneller opmeten in de meetstaat',
   'De meetstaat heeft nieuwe kolommen: Element, een aantal bij de breedte en bij de hoogte, en een factor. Drie gelijke ruiten meet je daardoor in één regel op in plaats van drie. Het element dat je invult wordt vanzelf overgenomen naar de volgende regel. Je loopt nu ook met de pijltoetsen door het rekenblad, zoals in een spreadsheet. En je kunt meetregels aanvinken en bewaren als Element, om ze daarna in een andere groep in te voegen inclusief de maten. De kolom Omschrijving heet voortaan Opmerking.');
