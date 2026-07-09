-- Migration v5: werkomschrijving-afbeeldingen per offerteregel
--
-- Foto's die in de calculatie bij de (uitgebreide) werkomschrijving horen, worden
-- als base64 data-URL's meegenomen naar de offerte zodat ze in de gerenderde
-- Word/PDF kunnen verschijnen. Opgeslagen als JSON-array van strings.
ALTER TABLE quote_lines
  ADD COLUMN IF NOT EXISTS werkomschrijving_afbeeldingen jsonb;
