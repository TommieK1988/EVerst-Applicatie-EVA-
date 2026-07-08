-- ─── Werkbegroting gedeeld: component-velden persistent maken ─────────────────
-- De werkbegroting wordt nu Supabase-first (gedeeld tussen gebruikers/apparaten).
-- De sync schreef drie velden niet mee, waardoor ze bij hydratie op een ander
-- apparaat verloren gingen:
--   • bouw7_line_id  — stabiel Bouw7 contract-order-line id → dedup bij re-import
--   • artikelnummer  — specificatie materiaal + sleutel voor samenvoegen
--   • uurtype        — specificatie arbeid (bijv. 'Gezel', 'Leerling')
-- Additief en idempotent.

alter table public.werkbegroting_componenten add column if not exists bouw7_line_id bigint;
alter table public.werkbegroting_componenten add column if not exists artikelnummer text;
alter table public.werkbegroting_componenten add column if not exists uurtype       text;

comment on column public.werkbegroting_componenten.bouw7_line_id is
  'Bouw7 contract-order-line id — dedup bij herhaald overhalen van bestelregels uit Bouw7.';
