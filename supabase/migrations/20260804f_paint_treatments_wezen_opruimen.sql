-- Recepten-bibliotheek — resten van een mislukte import opruimen
--
-- In `paint_treatments` staan 96 behandelingen (OHD01…OHV54) uit een eerdere,
-- half gelukte import van hetzelfde Calc4You-bestand. Ze zijn onbruikbaar:
--   * geen enkel gekoppeld recept;
--   * namen afgekapt op ~90 tekens;
--   * dubbel-gecodeerde tekens ("OHD03 â€” …", "poriÃ«n vullen").
--
-- Geverifieerd vóór het schrijven van deze migratie: 0 paint_items,
-- 0 paint_labor_norms, 0 paint_material_norms, 0 paint_measurement_lines en
-- 0 paint_measurement_aggregates verwijzen ernaar.
--
-- De behandelingen komen terug via de schilderbibliotheek, met volledige namen,
-- correcte tekens en de werkomschrijving uit het OnderhoudNL-bestek.
--
-- De voorwaarden hieronder zijn bewust streng: alleen rijen die op dit moment
-- nergens aan hangen worden verwijderd. Draait deze migratie ooit opnieuw in een
-- database waar ze wél gebruikt worden, dan gebeurt er niets.

delete from public.paint_treatments t
where t.source = 'Normbibliotheek XML'
  and not exists (select 1 from public.paint_items                i where i.treatment_id = t.id)
  and not exists (select 1 from public.paint_labor_norms          n where n.treatment_id = t.id)
  and not exists (select 1 from public.paint_material_norms       m where m.treatment_id = t.id)
  and not exists (select 1 from public.paint_measurement_lines    l where l.treatment_id = t.id)
  and not exists (select 1 from public.paint_measurement_aggregates a where a.treatment_id = t.id);
