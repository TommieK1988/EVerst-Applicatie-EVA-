-- Eenmalige datafix: de rol staat nu in `afdeling`. Verplaats hem naar `functie`
-- (met normalisatie 'Teamleiders' -> 'Teamleider') en zet `afdeling` op de echte
-- afdeling via de standaard_afdeling van die functie. Reeds correcte rijen
-- (functie al gevuld) en lege rijen blijven ongemoeid.
UPDATE medewerkers m
SET functie  = norm.functie_naam,
    afdeling = a.naam
FROM (
  SELECT id,
         CASE WHEN afdeling = 'Teamleiders' THEN 'Teamleider' ELSE afdeling END AS functie_naam
  FROM medewerkers
  WHERE functie IS NULL AND afdeling IS NOT NULL
) norm
JOIN medewerker_functies f ON lower(f.naam) = lower(norm.functie_naam)
JOIN medewerker_afdelingen a ON a.id = f.standaard_afdeling_id
WHERE m.id = norm.id;

-- Eenmalige backfill werkroosters: voor actieve medewerkers zonder rooster,
-- waarvan de functie een standaard_rooster heeft (Teamleider/Schilder/Timmerman).
WITH cand AS (
  SELECT m.id AS medewerker_id, f.standaard_rooster AS tmpl
  FROM medewerkers m
  JOIN medewerker_functies f
    ON lower(f.naam) = lower(m.functie) AND f.standaard_rooster IS NOT NULL
  WHERE m.actief = true
    AND NOT EXISTS (SELECT 1 FROM medewerker_roosters r WHERE r.medewerker_id = m.id)
),
ins AS (
  INSERT INTO medewerker_roosters
    (medewerker_id, geldig_vanaf, geldig_tot, werkdagen, dagstart, dageind, contracturen_per_week)
  SELECT medewerker_id, CURRENT_DATE, NULL,
         ARRAY(SELECT jsonb_array_elements_text(tmpl->'werkdagen')::smallint),
         (tmpl->>'dagstart')::time,
         (tmpl->>'dageind')::time,
         (tmpl->>'contracturen_per_week')::numeric
  FROM cand
  RETURNING id, medewerker_id
)
INSERT INTO medewerker_rooster_pauzes (rooster_id, pauze_start, pauze_eind)
SELECT ins.id, (p->>'pauze_start')::time, (p->>'pauze_eind')::time
FROM ins
JOIN cand ON cand.medewerker_id = ins.medewerker_id
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(cand.tmpl->'pauzes', '[]'::jsonb)) AS p;
