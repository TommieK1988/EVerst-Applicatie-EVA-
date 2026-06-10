-- =====================================================================
-- Wagenpark — fingerprint op compliance_bevindingen (persistent geheugen)
-- =====================================================================
-- Doel: als een bevinding eenmalig behandeld is (uitzondering / afgewezen),
-- moet hij bij volgende compliance-runs zijn status behouden. Zonder
-- fingerprint genereerde elke run nieuwe bevindingen en verloor de behandeling.
--
-- Fingerprint wordt door de app samengesteld:
--   - Trip-based bevindingen: "<regel>|trip|<trip_id>|<ernst>"
--   - Aggregaat (R2, R8): "<regel>|aggr|<ernst>|<user_id>|<jaar>|<extra>"
-- Unique index zorgt dat dezelfde fingerprint niet dubbel ontstaat; upsert
-- houdt de bestaande status als die != 'open' is.
-- =====================================================================

alter table public.compliance_bevindingen
  add column if not exists fingerprint text;

-- Unique index — staat multipele rows met NULL fingerprint toe (oude data)
create unique index if not exists compliance_bevindingen_fingerprint_uniq
  on public.compliance_bevindingen (fingerprint)
  where fingerprint is not null;
