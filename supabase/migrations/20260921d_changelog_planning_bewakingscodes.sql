-- Wat is nieuw: bewakingscodes uit de werkbegroting meteen kiesbaar in de detailplanning.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-21','verbeterd','Planning','Bewakingscodes uit de werkbegroting meteen te kiezen',
   'In de detailplanning kun je een fase of activiteit nu direct koppelen aan elke bewakingscode die in de werkbegroting staat — ook als die werkbegroting nog niet is goedgekeurd. Codes van stelposten en goedgekeurd meerwerk staan er net zo goed bij. Tegelijk zijn codes waar niets aan hangt uit de keuzelijst gehaald, zodat je alleen ziet waar je echt op kunt plannen; met één klik onderaan de lijst haal je ze alsnog tevoorschijn.');
