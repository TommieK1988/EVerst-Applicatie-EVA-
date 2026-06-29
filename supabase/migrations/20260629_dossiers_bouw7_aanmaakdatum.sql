-- Bouw7 project-aanmaakdatum → dossier (basis voor servicedesk-doorlooptijd).
--
-- De live /list/projects-response bevat een (ongedocumenteerd) `createdAt`-veld
-- (ISO-timestamp, bv. "2025-10-02T11:54:29+00:00"). Dit is de echte aanmaakdatum van
-- de melding/het project; syncProjects schrijft het naar bouw7_aanmaakdatum.

ALTER TABLE public.dossiers
  ADD COLUMN IF NOT EXISTS bouw7_aanmaakdatum timestamptz;

COMMENT ON COLUMN public.dossiers.bouw7_aanmaakdatum IS
  'Bouw7 project createdAt — aanmaakdatum van de melding/het project; basis voor servicedesk-doorlooptijd.';
