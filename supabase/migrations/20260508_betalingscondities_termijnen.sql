ALTER TABLE betalingscondities
  ADD COLUMN IF NOT EXISTS termijnen JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Bestaande rijen: zet tekst om als één termijn van 100%
UPDATE betalingscondities
  SET termijnen = jsonb_build_array(
    jsonb_build_object('omschrijving', tekst, 'percentage', 100)
  )
  WHERE tekst <> '' AND termijnen = '[]'::jsonb;
