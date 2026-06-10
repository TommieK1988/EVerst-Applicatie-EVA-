-- IFTTT-triggersysteem voor actielijst-sjablonen.
--
-- Generaliseert de enkele status-trigger (task_lists.trigger_hoofdstatus/substatus) naar:
--   * meerdere triggers per sjabloon (OR), elk met optionele AND-condities;
--   * event-types: dossier_status, dossier_aangemaakt, rol_toegewezen, veld_waarde, bedrag_drempel, toggle_aan;
--   * dossier-toggles als nieuw concept (event + conditie).
--
-- Matching verschuift van SQL naar een Node-evaluator: de DB-triggers doen alleen change-detectie
-- en enqueuen een ruw event (oud/nieuw-snapshot) in dossier_trigger_events.

-- ─── 1. Trigger-regels per sjabloon ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.actielijst_triggers (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id  uuid        NOT NULL REFERENCES public.task_lists(id) ON DELETE CASCADE,
  event_type   text        NOT NULL,   -- dossier_status | dossier_aangemaakt | rol_toegewezen | veld_waarde | bedrag_drempel | toggle_aan
  event_config jsonb       NOT NULL DEFAULT '{}',
  condities    jsonb       NOT NULL DEFAULT '[]',  -- array van AND-condities
  actief       boolean     NOT NULL DEFAULT true,
  volgorde     integer     NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS actielijst_triggers_template_idx
  ON public.actielijst_triggers (template_id);

CREATE INDEX IF NOT EXISTS actielijst_triggers_actief_idx
  ON public.actielijst_triggers (event_type)
  WHERE actief = true;

ALTER TABLE public.actielijst_triggers ENABLE ROW LEVEL SECURITY;

-- ─── 2. Dossier-toggles (definities + per-dossier standen) ───────────────────────

CREATE TABLE IF NOT EXISTS public.dossier_toggle_definities (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  sleutel    text        NOT NULL UNIQUE,   -- slug, bv. 'spoed'
  label      text        NOT NULL,
  volgorde   integer     NOT NULL DEFAULT 0,
  actief     boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dossier_toggle_definities ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.dossier_toggles (
  dossier_id     uuid        NOT NULL REFERENCES public.dossiers(id) ON DELETE CASCADE,
  definitie_id   uuid        NOT NULL REFERENCES public.dossier_toggle_definities(id) ON DELETE CASCADE,
  aan            boolean     NOT NULL DEFAULT false,
  gewijzigd_op   timestamptz NOT NULL DEFAULT now(),
  gewijzigd_door uuid,
  PRIMARY KEY (dossier_id, definitie_id)
);

CREATE INDEX IF NOT EXISTS dossier_toggles_dossier_idx
  ON public.dossier_toggles (dossier_id);

ALTER TABLE public.dossier_toggles ENABLE ROW LEVEL SECURITY;

-- ─── 3. Events-queue ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.dossier_trigger_events (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id  uuid        NOT NULL REFERENCES public.dossiers(id) ON DELETE CASCADE,
  soort       text        NOT NULL,   -- dossier_insert | dossier_update | toggle
  payload     jsonb       NOT NULL DEFAULT '{}',  -- { oud, nieuw } of toggle-velden
  status      text        NOT NULL DEFAULT 'pending',  -- pending | processing | done | error
  foutmelding text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  verwerkt_op timestamptz
);

CREATE INDEX IF NOT EXISTS dossier_trigger_events_pending_idx
  ON public.dossier_trigger_events (created_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS dossier_trigger_events_dossier_idx
  ON public.dossier_trigger_events (dossier_id);

ALTER TABLE public.dossier_trigger_events ENABLE ROW LEVEL SECURITY;

-- ─── 4. Data-migratie: bestaande enkele trigger → actielijst_triggers ────────────

INSERT INTO public.actielijst_triggers (template_id, event_type, event_config)
SELECT id, 'dossier_status',
       jsonb_build_object('hoofdstatus', trigger_hoofdstatus, 'substatus', trigger_substatus)
FROM public.task_lists
WHERE is_template = true
  AND trigger_hoofdstatus IS NOT NULL
  AND trigger_substatus IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.actielijst_triggers t WHERE t.template_id = task_lists.id
  );

COMMENT ON COLUMN public.task_lists.trigger_hoofdstatus IS 'DEPRECATED: vervangen door actielijst_triggers. Niet meer lezen.';
COMMENT ON COLUMN public.task_lists.trigger_substatus   IS 'DEPRECATED: vervangen door actielijst_triggers. Niet meer lezen.';

-- ─── 5. Change-detectie op dossiers (vervangt tg_dossier_enqueue_activeringen) ───

DROP TRIGGER IF EXISTS dossier_enqueue_activeringen ON public.dossiers;

CREATE OR REPLACE FUNCTION public.tg_dossier_trigger_events() RETURNS trigger AS $$
DECLARE
  v_oud  jsonb;
  v_nieuw jsonb;
BEGIN
  v_nieuw := jsonb_build_object(
    'hoofdstatus',          NEW.hoofdstatus::text,
    'aanvraag_substatus',   NEW.aanvraag_substatus::text,
    'offerte_substatus',    NEW.offerte_substatus::text,
    'opdracht_substatus',   NEW.opdracht_substatus::text,
    'servicedesk_substatus',NEW.servicedesk_substatus,
    'actieve_substatus',    public.dossier_actieve_substatus(
                              NEW.hoofdstatus::text, NEW.aanvraag_substatus::text,
                              NEW.offerte_substatus::text, NEW.opdracht_substatus::text),
    'categorie',            NEW.categorie,
    'bouw7_categorie_naam', NEW.bouw7_categorie_naam,
    'bedrag_excl_btw',      NEW.bedrag_excl_btw,
    'klant_id',             NEW.klant_id,
    'project_manager_id',   NEW.project_manager_id,
    'teamleider_id',        NEW.teamleider_id,
    'werkvoorbereider_id',  NEW.werkvoorbereider_id,
    'uitvoerder_id',        NEW.uitvoerder_id,
    'controller_id',        NEW.controller_id,
    'calculator_id',        NEW.calculator_id
  );

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.dossier_trigger_events (dossier_id, soort, payload)
    VALUES (NEW.id, 'dossier_insert', jsonb_build_object('oud', NULL, 'nieuw', v_nieuw));
    RETURN NULL;
  END IF;

  -- UPDATE: bouw oud-snapshot en enqueue alleen bij een gewijzigd gevolgd veld.
  v_oud := jsonb_build_object(
    'hoofdstatus',          OLD.hoofdstatus::text,
    'aanvraag_substatus',   OLD.aanvraag_substatus::text,
    'offerte_substatus',    OLD.offerte_substatus::text,
    'opdracht_substatus',   OLD.opdracht_substatus::text,
    'servicedesk_substatus',OLD.servicedesk_substatus,
    'actieve_substatus',    public.dossier_actieve_substatus(
                              OLD.hoofdstatus::text, OLD.aanvraag_substatus::text,
                              OLD.offerte_substatus::text, OLD.opdracht_substatus::text),
    'categorie',            OLD.categorie,
    'bouw7_categorie_naam', OLD.bouw7_categorie_naam,
    'bedrag_excl_btw',      OLD.bedrag_excl_btw,
    'klant_id',             OLD.klant_id,
    'project_manager_id',   OLD.project_manager_id,
    'teamleider_id',        OLD.teamleider_id,
    'werkvoorbereider_id',  OLD.werkvoorbereider_id,
    'uitvoerder_id',        OLD.uitvoerder_id,
    'controller_id',        OLD.controller_id,
    'calculator_id',        OLD.calculator_id
  );

  IF v_oud IS DISTINCT FROM v_nieuw THEN
    INSERT INTO public.dossier_trigger_events (dossier_id, soort, payload)
    VALUES (NEW.id, 'dossier_update', jsonb_build_object('oud', v_oud, 'nieuw', v_nieuw));
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  PERFORM 1 FROM pg_trigger WHERE tgname = 'dossier_trigger_events';
  IF NOT FOUND THEN
    CREATE TRIGGER dossier_trigger_events
      AFTER INSERT OR UPDATE ON public.dossiers
      FOR EACH ROW EXECUTE FUNCTION public.tg_dossier_trigger_events();
  END IF;
END $$;

-- ─── 6. Change-detectie op dossier_toggles ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.tg_dossier_toggle_events() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.aan IS NOT DISTINCT FROM NEW.aan THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.dossier_trigger_events (dossier_id, soort, payload)
  VALUES (
    NEW.dossier_id, 'toggle',
    jsonb_build_object(
      'definitie_id', NEW.definitie_id,
      'oud_aan',      CASE WHEN TG_OP = 'UPDATE' THEN OLD.aan ELSE false END,
      'nieuw_aan',    NEW.aan
    )
  );
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  PERFORM 1 FROM pg_trigger WHERE tgname = 'dossier_toggle_events';
  IF NOT FOUND THEN
    CREATE TRIGGER dossier_toggle_events
      AFTER INSERT OR UPDATE ON public.dossier_toggles
      FOR EACH ROW EXECUTE FUNCTION public.tg_dossier_toggle_events();
  END IF;
END $$;
