-- Sjabloon-trigger: automatische activatie van actielijst-sjablonen bij dossierstatus-wijziging.
--
-- Probleem: fase-promoties gebeuren in de BEFORE-trigger tg_dossier_status_change
-- (aanvraag/verzonden → offerte/verzonden, offerte/gewonnen → opdracht/nieuwe_opdracht).
-- Een AFTER-trigger ziet daardoor altijd de EINDstatus en kan write-path-agnostisch
-- (Kanban, Informatie-tab, Bouw7-sync, externe DB-writes, INSERT) bepalen welke
-- sjablonen geactiveerd moeten worden. De DB enqueuet; een Node-executor voert uit.

-- ─── Audit-log + idempotentie-anker ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.actielijst_activeringen (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id          uuid        NOT NULL REFERENCES public.dossiers(id)   ON DELETE CASCADE,
  template_id         uuid        NOT NULL REFERENCES public.task_lists(id) ON DELETE CASCADE,
  trigger_hoofdstatus text,
  trigger_substatus   text,
  status              text        NOT NULL DEFAULT 'pending',  -- pending | done | skipped | error
  lijst_id            uuid        REFERENCES public.task_lists(id) ON DELETE SET NULL,
  bron                text        NOT NULL DEFAULT 'trigger',  -- trigger | handmatig
  foutmelding         text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  verwerkt_op         timestamptz,
  -- Dwingt "exact één keer per (sjabloon, dossier)" af.
  CONSTRAINT actielijst_activeringen_uniek UNIQUE (template_id, dossier_id)
);

CREATE INDEX IF NOT EXISTS actielijst_activeringen_pending_idx
  ON public.actielijst_activeringen (created_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS actielijst_activeringen_dossier_idx
  ON public.actielijst_activeringen (dossier_id);

CREATE INDEX IF NOT EXISTS actielijst_activeringen_lijst_idx
  ON public.actielijst_activeringen (lijst_id)
  WHERE lijst_id IS NOT NULL;

-- GEEN RLS-policies (consistent met platform_core draft): alleen benaderbaar via service_role.
ALTER TABLE public.actielijst_activeringen ENABLE ROW LEVEL SECURITY;

-- ─── Helper: leid de actieve substatus af uit een dossierrij ────────────────────

CREATE OR REPLACE FUNCTION public.dossier_actieve_substatus(
  p_hoofd    text,
  p_aanvraag text,
  p_offerte  text,
  p_opdracht text
) RETURNS text AS $$
  SELECT CASE p_hoofd
    WHEN 'aanvraag' THEN p_aanvraag
    WHEN 'offerte'  THEN p_offerte
    WHEN 'opdracht' THEN p_opdracht
    ELSE NULL
  END;
$$ LANGUAGE sql IMMUTABLE;

-- ─── Trigger: enqueue matchende sjablonen bij statuswijziging ───────────────────

CREATE OR REPLACE FUNCTION public.tg_dossier_enqueue_activeringen() RETURNS trigger AS $$
DECLARE
  v_nieuwe_sub text;
  v_oude_sub   text;
BEGIN
  v_nieuwe_sub := public.dossier_actieve_substatus(
    NEW.hoofdstatus::text, NEW.aanvraag_substatus::text,
    NEW.offerte_substatus::text, NEW.opdracht_substatus::text);

  -- Alleen doorgaan bij een echte statuswijziging (bij UPDATE).
  IF TG_OP = 'UPDATE' THEN
    v_oude_sub := public.dossier_actieve_substatus(
      OLD.hoofdstatus::text, OLD.aanvraag_substatus::text,
      OLD.offerte_substatus::text, OLD.opdracht_substatus::text);
    IF (NEW.hoofdstatus, v_nieuwe_sub) IS NOT DISTINCT FROM (OLD.hoofdstatus, v_oude_sub) THEN
      RETURN NULL;
    END IF;
  END IF;

  -- Enqueue elk matchend sjabloon. ON CONFLICT DO NOTHING = idempotent (één keer per dossier).
  -- Promotie-equivalentie: omdat de BEFORE-trigger promoot, ziet deze trigger de eindstatus.
  -- We matchen óók op het bron-paar zodat een sjabloon ingesteld op bv. 'offerte/gewonnen'
  -- net zo goed vuurt als één ingesteld op 'opdracht/nieuwe_opdracht'.
  INSERT INTO public.actielijst_activeringen
    (dossier_id, template_id, trigger_hoofdstatus, trigger_substatus, status, bron)
  SELECT NEW.id, tl.id, tl.trigger_hoofdstatus, tl.trigger_substatus, 'pending', 'trigger'
  FROM public.task_lists tl
  WHERE tl.is_template = true
    AND tl.trigger_hoofdstatus IS NOT NULL
    AND tl.trigger_substatus   IS NOT NULL
    AND (
      -- Eindstatus
      (tl.trigger_hoofdstatus = NEW.hoofdstatus::text AND tl.trigger_substatus = v_nieuwe_sub)
      -- offerte/gewonnen → opdracht/nieuwe_opdracht
      OR (TG_OP = 'UPDATE'
          AND OLD.hoofdstatus = 'offerte' AND NEW.hoofdstatus = 'opdracht'
          AND NEW.opdracht_substatus = 'nieuwe_opdracht'
          AND tl.trigger_hoofdstatus = 'offerte' AND tl.trigger_substatus = 'gewonnen')
      -- aanvraag/verzonden → offerte/verzonden
      OR (TG_OP = 'UPDATE'
          AND OLD.hoofdstatus = 'aanvraag' AND NEW.hoofdstatus = 'offerte'
          AND NEW.offerte_substatus = 'verzonden'
          AND tl.trigger_hoofdstatus = 'aanvraag' AND tl.trigger_substatus = 'verzonden')
    )
  ON CONFLICT (template_id, dossier_id) DO NOTHING;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  PERFORM 1 FROM pg_trigger WHERE tgname = 'dossier_enqueue_activeringen';
  IF NOT FOUND THEN
    CREATE TRIGGER dossier_enqueue_activeringen
      AFTER INSERT OR UPDATE ON public.dossiers
      FOR EACH ROW EXECUTE FUNCTION public.tg_dossier_enqueue_activeringen();
  END IF;
END $$;
