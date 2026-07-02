-- Functie krijgt een standaard-afdeling zodat medewerkers automatisch de juiste
-- afdeling erven. In dit bedrijf bevat het Bouw7-"department" feitelijk de rol
-- (Schilder, Timmerman, Teamleiders, Administratie, Projectbureau, Directie);
-- die rol wordt de EVA-functie en rolt op naar een echte afdeling.

ALTER TABLE medewerker_functies
  ADD COLUMN IF NOT EXISTS standaard_afdeling_id uuid REFERENCES medewerker_afdelingen(id);

-- Ontbrekende functies aanvullen (Bouw7-departments die als functie fungeren).
-- 'Teamleiders' (meervoud, alleen in de data) mapt op de bestaande 'Teamleider'.
INSERT INTO medewerker_functies (naam, volgorde, actief, created_at)
SELECT v.naam, v.volgorde, true, now()
FROM (VALUES ('Administratie', 20), ('Projectbureau', 21), ('Directie', 22)) AS v(naam, volgorde)
WHERE NOT EXISTS (
  SELECT 1 FROM medewerker_functies f WHERE lower(f.naam) = lower(v.naam)
);

-- Rollup functie -> afdeling:
--   Schilder / Timmerman / Teamleider -> Uitvoering
--   Administratie / Projectbureau      -> Kantoor
--   Directie                           -> Directie
UPDATE medewerker_functies f
SET standaard_afdeling_id = a.id
FROM medewerker_afdelingen a
WHERE (
  (f.naam IN ('Teamleider', 'Schilder', 'Timmerman') AND a.naam = 'Uitvoering') OR
  (f.naam IN ('Administratie', 'Projectbureau')       AND a.naam = 'Kantoor')    OR
  (f.naam = 'Directie'                                 AND a.naam = 'Directie')
);
