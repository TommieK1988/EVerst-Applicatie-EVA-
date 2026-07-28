-- Changelog: meerdere werkzaamheden per houtrotreparatie (livegang 2026-07-28).
-- Toegepast op productie via de Supabase MCP op het moment van livegang op main.

insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-07-28','verbeterd','Houtrot','Meerdere werkzaamheden per houtrotreparatie',
   'Bij een houtrotreparatie leg je nu meerdere werkzaamheden vast met een aantal per stuk — bijvoorbeeld 1× onderdorpel vervangen, 1× beplating de/hermonteren en 4× glaslat. De prijzen tellen automatisch op tot een reparatietotaal. Voor- en na-foto''s worden nu bewaard en zijn ook op de desktop te bekijken.');
