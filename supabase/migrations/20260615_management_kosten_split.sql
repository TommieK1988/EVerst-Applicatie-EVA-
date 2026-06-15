-- =====================================================================
-- Management: kostensoort-splitsing per project (voor Kostensoort-pie)
-- Gerealiseerde kosten uitgesplitst naar kostensoort, gevuld door de
-- Bouw7 management-sync uit Athena costs.{labor,subcontracting,...}.realised.
-- Eén jsonb-kolom: { lonen, onderaanneming, materiaal, materieel, inkoop, overig }
-- =====================================================================

alter table public.management_projecten
  add column if not exists kosten_split jsonb;
