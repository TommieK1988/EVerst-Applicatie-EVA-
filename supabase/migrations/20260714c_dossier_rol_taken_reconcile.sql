-- Dossier-rol-taken automatisch (her)koppelen aan de actuele rolhouder.
--
-- Achtergrond: bij het activeren van een actielijst-sjabloon op een dossier worden taken met
-- assignee_type = 'dossier_rol' meteen aan de dan-bekende rolhouder gekoppeld (zie
-- activeerSjabloon in taken/actions/sjablonen.ts). Was een projectrol (bv. calculator of
-- projectleider) op dat moment nog niet ingevuld, dan bleef de taak zonder gekoppelde gebruiker.
-- En als de rol later WIJZIGT bewoog de bestaande taak niet mee.
--
-- Deze trigger reconcilieert die koppelingen telkens wanneer een rolveld op het dossier verandert
-- — ongeacht de bron van de wijziging (informatietab, taak-voltooiingsactie, Bouw7-sync, of losse
-- SQL). De verantwoordelijke-toewijzingen van elke dossier-rol-taak worden gelijkgetrokken met de
-- huidige rolhouders: ontbrekende koppelingen worden toegevoegd, koppelingen die niet meer bij een
-- actuele rolhouder horen worden verwijderd.
--
-- Scope: alleen task_assignees met rol = 'verantwoordelijke' (de rol waarmee dossier-rol-taken
-- worden gekoppeld). Handmatig toegevoegde 'mede-uitvoerder'/'reviewer'-collega's blijven staan.
-- LET OP: de rol->kolom-mapping en auth_user_id-resolutie zijn een SQL-spiegel van activeerSjabloon;
-- houd beide in sync bij het toevoegen/wijzigen van projectrollen.

CREATE OR REPLACE FUNCTION public.fn_reconcile_dossier_rol_taken_for(p_dossier_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dossier jsonb;
  v_taak    RECORD;
  v_rol     text;
  v_med_id  uuid;
  v_auth_id uuid;
  v_gewenst uuid[];
BEGIN
  SELECT to_jsonb(d) INTO v_dossier FROM public.dossiers d WHERE d.id = p_dossier_id;
  IF v_dossier IS NULL THEN
    RETURN;
  END IF;

  -- Alle dossier-rol-taken op geactiveerde (niet-sjabloon) actielijsten van dit dossier.
  FOR v_taak IN
    SELECT t.id, t.dossier_rollen
    FROM public.tasks t
    JOIN public.task_lists l ON l.id = t.lijst_id
    WHERE l.dossier_id = p_dossier_id
      AND l.is_template = false
      AND t.assignee_type = 'dossier_rol'
      AND coalesce(array_length(t.dossier_rollen, 1), 0) > 0
  LOOP
    -- Gewenste set gebruikers = auth_user_id van elke ingevulde rol op het dossier.
    v_gewenst := ARRAY[]::uuid[];
    FOREACH v_rol IN ARRAY v_taak.dossier_rollen LOOP
      v_med_id := NULLIF(v_dossier ->> v_rol, '')::uuid;   -- rol = dossier-kolomnaam, bv. 'calculator_id'
      IF v_med_id IS NULL THEN
        CONTINUE;
      END IF;
      SELECT auth_user_id INTO v_auth_id FROM public.medewerkers WHERE id = v_med_id;
      IF v_auth_id IS NOT NULL AND NOT (v_auth_id = ANY(v_gewenst)) THEN
        v_gewenst := array_append(v_gewenst, v_auth_id);
      END IF;
    END LOOP;

    -- Ontbrekende koppelingen toevoegen (idempotent; PK = (task_id, user_id)).
    INSERT INTO public.task_assignees (task_id, user_id, rol)
    SELECT v_taak.id, u, 'verantwoordelijke'
    FROM unnest(v_gewenst) AS u
    ON CONFLICT (task_id, user_id) DO NOTHING;

    -- Rol-gestuurde koppelingen die niet meer bij een actuele rolhouder horen, verwijderen.
    DELETE FROM public.task_assignees a
    WHERE a.task_id = v_taak.id
      AND a.rol = 'verantwoordelijke'
      AND NOT (a.user_id = ANY(v_gewenst));
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_dossier_rol_taken_reconcile()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.fn_reconcile_dossier_rol_taken_for(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_dossier_rol_taken_reconcile ON public.dossiers;
CREATE TRIGGER tg_dossier_rol_taken_reconcile
AFTER UPDATE ON public.dossiers
FOR EACH ROW
WHEN (
  OLD.project_manager_id  IS DISTINCT FROM NEW.project_manager_id  OR
  OLD.teamleider_id       IS DISTINCT FROM NEW.teamleider_id       OR
  OLD.werkvoorbereider_id IS DISTINCT FROM NEW.werkvoorbereider_id OR
  OLD.calculator_id       IS DISTINCT FROM NEW.calculator_id       OR
  OLD.uitvoerder_id       IS DISTINCT FROM NEW.uitvoerder_id       OR
  OLD.controller_id       IS DISTINCT FROM NEW.controller_id
)
EXECUTE FUNCTION public.fn_dossier_rol_taken_reconcile();

-- Eenmalige back-fill: bestaande geactiveerde actielijsten meteen gelijktrekken met de
-- huidige rolhouders (dossiers zonder dossier-rol-taken zijn een no-op).
SELECT public.fn_reconcile_dossier_rol_taken_for(d.id)
FROM public.dossiers d
WHERE EXISTS (
  SELECT 1
  FROM public.task_lists l
  JOIN public.tasks t ON t.lijst_id = l.id
  WHERE l.dossier_id = d.id
    AND l.is_template = false
    AND t.assignee_type = 'dossier_rol'
);
