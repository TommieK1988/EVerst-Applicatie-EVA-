-- ─── Werkbegroting-regel: groep_id mag null zijn ─────────────────────────────
-- Regels die niet uit een EVA-calculatie komen (nieuwe regel via de grid, of een
-- Bouw7-import van bewakingscodes/bestelregels) hebben geen calculatiegroep. De
-- client zette daarvoor groep_id = "" (lege string); dat weigert Postgres met
-- `invalid input syntax for type uuid: ""`, en de NOT NULL zou null ook blokkeren.
-- De FK op calculation_groups is al eerder vervallen (20260703_goedkeuringen.sql);
-- nu ook de NOT NULL laten vervallen zodat groep_id null kan zijn.

alter table public.werkbegroting_regels alter column groep_id drop not null;
