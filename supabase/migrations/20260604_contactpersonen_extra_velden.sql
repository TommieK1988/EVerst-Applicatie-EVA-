-- =====================================================================
-- Contactpersonen: extra persoonsgegevens
-- =====================================================================

ALTER TABLE public.contactpersonen
  ADD COLUMN IF NOT EXISTS aanhef         text,           -- "De heer", "Mevrouw", …
  ADD COLUMN IF NOT EXISTS geslacht       text,           -- 'man' | 'vrouw' | 'overig'
  ADD COLUMN IF NOT EXISTS voorletter     text,
  ADD COLUMN IF NOT EXISTS geboortedatum  date,
  ADD COLUMN IF NOT EXISTS prive_email    text,
  ADD COLUMN IF NOT EXISTS prive_telefoon text,
  ADD COLUMN IF NOT EXISTS prive_adres_straat   text,
  ADD COLUMN IF NOT EXISTS prive_adres_postcode text,
  ADD COLUMN IF NOT EXISTS prive_adres_plaats   text,
  ADD COLUMN IF NOT EXISTS prive_adres_land     text DEFAULT 'Nederland';
