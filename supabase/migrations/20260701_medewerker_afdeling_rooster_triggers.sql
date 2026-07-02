-- Houd afdeling afgeleid van functie en koppel roosters automatisch, ook voor
-- toekomstige Bouw7-hires. De Bouw7-sync schrijft `afdeling` niet meer; deze
-- triggers vullen hem (en het rooster) bij nieuwe/aangepaste medewerkers.

-- 1) Afdeling afleiden uit functie wanneer afdeling leeg is. Een handmatig
--    gezette afdeling (niet-null) wordt nooit overschreven.
CREATE OR REPLACE FUNCTION medewerker_afdeling_from_functie()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.afdeling IS NULL AND NEW.functie IS NOT NULL THEN
    SELECT a.naam INTO NEW.afdeling
    FROM medewerker_functies f
    JOIN medewerker_afdelingen a ON a.id = f.standaard_afdeling_id
    WHERE lower(f.naam) = lower(NEW.functie)
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_medewerker_afdeling_from_functie ON medewerkers;
CREATE TRIGGER trg_medewerker_afdeling_from_functie
  BEFORE INSERT OR UPDATE OF functie, afdeling ON medewerkers
  FOR EACH ROW EXECUTE FUNCTION medewerker_afdeling_from_functie();

-- 2) Werkrooster seeden uit functie.standaard_rooster wanneer de medewerker er
--    nog geen heeft. Functies zonder standaard_rooster worden overgeslagen.
CREATE OR REPLACE FUNCTION medewerker_seed_rooster()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  tmpl           jsonb;
  new_rooster_id uuid;
  p              jsonb;
BEGIN
  IF NEW.functie IS NULL THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM medewerker_roosters WHERE medewerker_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  SELECT f.standaard_rooster INTO tmpl
  FROM medewerker_functies f
  WHERE lower(f.naam) = lower(NEW.functie) AND f.standaard_rooster IS NOT NULL
  LIMIT 1;
  IF tmpl IS NULL THEN RETURN NEW; END IF;

  INSERT INTO medewerker_roosters
    (medewerker_id, geldig_vanaf, geldig_tot, werkdagen, dagstart, dageind, contracturen_per_week)
  VALUES (
    NEW.id, CURRENT_DATE, NULL,
    ARRAY(SELECT jsonb_array_elements_text(tmpl->'werkdagen')::smallint),
    (tmpl->>'dagstart')::time,
    (tmpl->>'dageind')::time,
    (tmpl->>'contracturen_per_week')::numeric
  )
  RETURNING id INTO new_rooster_id;

  FOR p IN SELECT jsonb_array_elements(COALESCE(tmpl->'pauzes', '[]'::jsonb))
  LOOP
    INSERT INTO medewerker_rooster_pauzes (rooster_id, pauze_start, pauze_eind)
    VALUES (new_rooster_id, (p->>'pauze_start')::time, (p->>'pauze_eind')::time);
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_medewerker_seed_rooster ON medewerkers;
CREATE TRIGGER trg_medewerker_seed_rooster
  AFTER INSERT ON medewerkers
  FOR EACH ROW EXECUTE FUNCTION medewerker_seed_rooster();
