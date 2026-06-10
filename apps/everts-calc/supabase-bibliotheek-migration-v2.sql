-- Bibliotheek migration v2 — BTW tarief per recept
-- Uitvoeren in Supabase SQL Editor

ALTER TABLE paint_items
  ADD COLUMN IF NOT EXISTS btw_tarief text NOT NULL DEFAULT 'hoog'
    CHECK (btw_tarief IN ('hoog', 'laag', 'vrijgesteld'));
