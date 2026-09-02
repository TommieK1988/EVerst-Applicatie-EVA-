-- Changelog: planitem-kleur volgt de projectleider (zie plan-item-write.ts)
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-02','verbeterd','Planning','Planning in Bouw7 krijgt de kleur van de projectleider',
   'Planning die vanuit EVA in Bouw7 komt te staan, krijgt automatisch de kleur van de projectleider van het dossier — dezelfde kleuren die in Bouw7 al bij de namen horen. Wissel je de projectleider, dan kleurt de hele planning van dat project mee. Zo klopt het planbord weer in één oogopslag.');
