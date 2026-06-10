-- =====================================================================
-- Everts Platform — Dossier extra velden + relatie factuuradressen
-- =====================================================================

-- ── 1. Factuuradressen per relatie ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.relatie_factuuradressen (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  relatie_id  uuid NOT NULL REFERENCES public.relaties(id) ON DELETE CASCADE,
  label       text NOT NULL,
  straat      text,
  postcode    text,
  plaats      text,
  land        text DEFAULT 'Nederland',
  opmerkingen text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS relatie_factuuradressen_relatie_idx
  ON public.relatie_factuuradressen (relatie_id);

-- ── 2. Nieuwe kolommen op dossiers ───────────────────────────────────
ALTER TABLE public.dossiers
  ADD COLUMN IF NOT EXISTS opdracht_referentie text,
  ADD COLUMN IF NOT EXISTS factuuradres_id uuid
    REFERENCES public.relatie_factuuradressen(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS dossiers_factuuradres_idx
  ON public.dossiers (factuuradres_id)
  WHERE factuuradres_id IS NOT NULL;
