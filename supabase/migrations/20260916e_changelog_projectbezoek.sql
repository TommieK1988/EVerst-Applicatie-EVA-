-- Changelog: het projectbezoek per discipline en de opgeschoonde mobiele dossierlijst.
-- Toegevoegd nadat de wijziging op `main` stond; de changelog-tabel is gedeeld en elk
-- gepubliceerd item is meteen voor iedereen zichtbaar.

insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-16','verbeterd','Dossiers','Projectbezoek werkt nu per discipline',
   'Je begint een projectbezoek voortaan met de vraag welke disciplines er worden uitgevoerd — '
   || 'schilderwerk, houtrotherstel, voegwerk en zo verder. Per discipline leg je losse punten '
   || 'vast met een omschrijving en een foto, en onderaan geef je per discipline aan hoe ver het '
   || 'werk is. De keuze van vorige keer staat de volgende keer alvast klaar.'),

  ('2026-09-16','nieuw','Dossiers','Een punt uit een bezoek kan meteen een aandachtspunt worden',
   'Bij elk punt dat je tijdens een projectbezoek vastlegt staat een vinkje "ook als aandachtspunt '
   || 'op het dossier". Zet je dat aan, dan komt het punt inclusief foto op de aandachtspuntenlijst '
   || 'van het dossier en krijgt het een nummer en opvolging. Laat je het uit, dan blijft het alleen '
   || 'in het bezoek en in de rapportage staan.'),

  ('2026-09-16','verbeterd','Dossiers','Bezoekrapport toont de voortgang per discipline',
   'Het bezoekrapport begint nu met een overzicht van de voortgang per discipline, gevolgd door de '
   || 'aandachtspunten en een verslag per onderdeel. De hoofdstukken over metingen en beoordeelde '
   || 'controlepunten zijn eruit: die hoorden bij de kwaliteitscontrole.'),

  ('2026-09-16','verbeterd','Dossiers','Dossiers op je telefoon: alleen lopend werk, met zoekveld',
   'Het tabblad Dossiers op de telefoon laat alleen nog werk zien dat loopt; financieel gereed en '
   || 'afgesloten dossiers verdwijnen uit de lijst. De knop "Alle" is weg en een kopje zonder '
   || 'dossiers wordt niet meer getoond. Staan er meer dan vijf dossiers in een groep, dan verschijnt '
   || 'er een zoekveld waarmee je op titel, nummer, klant of projectleider zoekt.');
