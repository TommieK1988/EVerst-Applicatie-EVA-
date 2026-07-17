-- =====================================================================
-- Opruimen: task_lists.streefdatum_bron weg
--
-- Vervolg op 20260718, dat de dossier-datums per taak als deadline-anker introduceerde
-- en de bestaande taken al omzette. Deze kolom is sindsdien dood gewicht.
--
-- LET OP — pas toepassen nádat de bijbehorende code op productie staat (main → Vercel).
-- Draait er nog oude code, dan leest die de kolom nog uit (verwerkDossier) en schrijft
-- die hem bij het kopiëren van een sjabloon; beide breken op een ontbrekende kolom.
-- =====================================================================

alter table public.task_lists drop constraint if exists task_lists_streefdatum_bron_check;
alter table public.task_lists drop column if exists streefdatum_bron;
