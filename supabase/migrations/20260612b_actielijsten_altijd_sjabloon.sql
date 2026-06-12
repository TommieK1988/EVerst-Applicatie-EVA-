-- Actielijsten zijn altijd sjablonen.
--
-- De UI-toggle ("Maak sjabloon") is verwijderd: elke via de app aangemaakte actielijst
-- is een sjabloon. is_template=false blijft alleen bestaan voor dossier-instanties
-- (klonen die activeerSjabloon aanmaakt, herkenbaar aan dossier_id).
-- Promoveer bestaande losse lijsten (zonder dossier) naar sjabloon.

UPDATE public.task_lists
SET is_template = true
WHERE dossier_id IS NULL
  AND is_template = false;
