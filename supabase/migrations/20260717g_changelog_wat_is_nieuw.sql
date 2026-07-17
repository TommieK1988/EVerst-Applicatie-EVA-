-- Changelog-item voor de "Wat is nieuw"-pagina zelf. De functie staat op main
-- (= Vercel-productie), dus het item mag nu zichtbaar worden.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-07-16','nieuw','Algemeen','Zie in EVA wat er nieuw is',
   'Via het sterretje in de bovenbalk vind je voortaan een overzicht van alle nieuwe functies, verbeteringen en opgeloste fouten. Zodra er iets bij komt zie je een stipje bij het sterretje en verschijnt er kort een melding als je inlogt.');
