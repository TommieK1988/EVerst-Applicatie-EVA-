-- Changelog: kostengroep kiezen en slepen in de werkbegroting
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-08-07','verbeterd','Calculatie','Regels makkelijker in een andere kostengroep zetten',
   'De kolom Kostengroep in de werkbegroting opent nu een volledige keuzelijst met zoekveld, in plaats van alleen de groep waar de regel al in stond. Slepen werkt ook prettiger: de tabel scrollt mee als je naar boven of beneden sleept, je kunt een regel op elke regel van de doelgroep loslaten in plaats van precies op het groepskopje, en heb je meerdere regels aangevinkt dan verhuizen ze in één keer mee.');
