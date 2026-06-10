-- =====================================================================
-- Wagenpark — handmatige override op rit_type_berekend
-- =====================================================================
-- De DB-trigger vult rit_type_berekend op basis van datum+tijd (werktijd/weekend).
-- Soms is die classificatie onjuist (bv. weekendwerk bij klant = wél zakelijk).
-- Deze kolommen laten handmatige correctie per rit toe:
--   - rit_type_override: nullable override. Wordt gebruikt door compliance-engine
--   - rit_type_handmatig: vlag zodat UI "gecorrigeerd" kan tonen
-- =====================================================================

alter table public.ulu_trips
  add column if not exists rit_type_override rit_type_berekend,
  add column if not exists rit_type_handmatig boolean not null default false;

create index if not exists ulu_trips_handmatig_idx
  on public.ulu_trips (id) where rit_type_handmatig = true;
