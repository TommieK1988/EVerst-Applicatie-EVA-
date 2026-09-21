-- Wat-is-nieuw-items voor de Bestanden-tab (21 september 2026).
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-21','verbeterd','Dossiers','Ook SharePoint-bestanden mee naar de app',
   'Het vinkje "In app" werkte alleen bij bestanden uit Bouw7; bij alles uit de SharePoint-dossiermap stond een streepje. Nu kun je elk bestand vrijgeven voor de telefoon. De twee vinkjes staan voortaan vooraan in de lijst, zodat je ze niet meer hoeft te zoeken achter de bestandsnamen.'),
  ('2026-09-21','opgelost','Dossiers','Open in Verkenner laat nu zien wat er mis is',
   'Op een pc zonder de EVA-snelkoppeling gebeurde er bij deze knop helemaal niets. Voortaan verschijnt er een venster met het netwerkpad van de dossiermap en een kopieerknop: plakken in de adresbalk van Verkenner en je bent er, ook zonder die snelkoppeling.');
