-- Changelog: meerwerk koppelen aan een bewakingscode voor het resultaat per code.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-29','verbeterd','Financieel','Meerwerk zichtbaar in het resultaat per bewakingscode',
   'Heeft een meerwerkregel geen eigen bewakingscode, dan kies je op het tabblad Meerwerk op welke code de kosten staan. Op het tabblad Financieel krijgt dat meerwerk dan een eigen regel in het verwachte resultaat, in plaats van op te gaan in de aanneemsom.');
