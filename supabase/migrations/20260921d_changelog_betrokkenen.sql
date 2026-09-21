-- Wat-is-nieuw: contactpersonen bij een factuuradres + het blok Betrokkenen op het dossier.

insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-21','nieuw','Relaties','Contactpersonen bij een factuuradres',
   'Je kunt nu per factuuradres vastleggen wie je daarvoor moet hebben: de voorzitter of penningmeester van een VvE, of de assetmanager van een portefeuille. Dat doe je op de relatiekaart bij het adres zelf. Op de kaart van de contactpersoon zie je omgekeerd voor welke adressen hij staat.'),
  ('2026-09-21','nieuw','Dossiers','Betrokkenen bij een opdracht op één plek',
   'Op het tabblad Informatie staat een nieuw blok Betrokkenen met iedereen met wie je over deze opdracht schakelt. De contactpersoon van de opdrachtgever en de mensen bij het gekozen factuuradres verschijnen er automatisch. Zelf voeg je er personen of bedrijven aan toe met hun rol, bijvoorbeeld een architect of een opzichter.');
