-- Servicedesk stap 1 — EVA-eigen dossierkolommen.
--
-- Deze kolommen worden NIET door de Bouw7-sync gezet: syncProjects() upsert alleen
-- zijn eigen veldenset, dus ON CONFLICT DO UPDATE laat deze kolommen ongemoeid
-- (zelfde patroon als interne_opmerkingen).
--
--  * mandaat_bedrag            — handmatig opgegeven mandaat (servicedesk), basis voor de
--                               mandaat-indicator op Informatie/Financieel.
--  * facturatiemethode         — 'regie' (default) of 'termijnen'. Wordt 'termijnen' zodra
--                               een EVA-offerte op Akkoord staat, tenzij handmatig vastgezet.
--  * facturatiemethode_handmatig — true = door gebruiker vastgezet; auto-logica overschrijft niet.

ALTER TABLE public.dossiers
  ADD COLUMN IF NOT EXISTS mandaat_bedrag               numeric(12,2),
  ADD COLUMN IF NOT EXISTS facturatiemethode            text NOT NULL DEFAULT 'regie',
  ADD COLUMN IF NOT EXISTS facturatiemethode_handmatig  boolean NOT NULL DEFAULT false;

ALTER TABLE public.dossiers
  DROP CONSTRAINT IF EXISTS dossiers_facturatiemethode_check;
ALTER TABLE public.dossiers
  ADD CONSTRAINT dossiers_facturatiemethode_check
  CHECK (facturatiemethode IN ('regie', 'termijnen'));

COMMENT ON COLUMN public.dossiers.mandaat_bedrag IS
  'Servicedesk: handmatig opgegeven mandaat (EUR excl. BTW). EVA-eigen, niet uit Bouw7.';
COMMENT ON COLUMN public.dossiers.facturatiemethode IS
  'Servicedesk facturatiewijze: regie (default) of termijnen (na offerte-akkoord).';
COMMENT ON COLUMN public.dossiers.facturatiemethode_handmatig IS
  'true = facturatiemethode handmatig vastgezet; auto-logica (offerte-akkoord) overschrijft niet.';
