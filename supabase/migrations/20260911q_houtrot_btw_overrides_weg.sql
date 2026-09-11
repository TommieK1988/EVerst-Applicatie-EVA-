-- Btw-tarief per werkzaamheid aanpassen per dossier/opdrachtgever is vervallen.
--
-- Gebouwd op 2026-09-11 (migratie 20260911m) en dezelfde dag weer ingetrokken: in
-- de praktijk is het tarief uit de eenheidsprijs genoeg. De rapportage bepaalt het
-- btw-percentage voortaan alleen nog uit `paint_items.btw_tarief`.
--
-- De tabel was leeg; er gaat dus niets verloren.
--
-- Toegepast op productie via de Supabase MCP op 2026-09-11.
drop table if exists public.houtrot_btw_tarieven;

notify pgrst, 'reload schema';
