-- Locatie-inrichting van houtrot wordt een boomstructuur i.p.v. een platte lijst
-- van 3 niveaus. De boom staat als platte knooplijst met parent_id in één jsonb-
-- kolom; kinderen/outline worden bij render berekend (zelfde model als de
-- calculatie-boom). `labels` = optionele niveaunamen per diepte (max 3).
--   boom = {"labels":["Gevelzijde","Etage","Huisnummer"],
--           "nodes":[{"id":..,"parent_id":..,"naam":..,"volgorde":..}]}
-- De oude kolom `niveaus` blijft staan maar wordt niet meer gelezen (deprecated).
--
-- Toegepast op productie via de Supabase MCP op 2026-07-30.
alter table public.houtrot_dossier_config
  add column if not exists boom jsonb not null default '{"labels":[],"nodes":[]}'::jsonb;

notify pgrst, 'reload schema';
