-- =====================================================================
-- Wagenpark — edits, archivering, bestuurder↔voertuig koppeling
-- =====================================================================
-- Wijzigingen:
--   1. ulu_users.actief (default true) — archiveren mogelijk maken
--   2. voertuigen.bijtelling_betaald → verwijderd (zit nu op bestuurder)
--   3. voertuig_bestuurders.medewerker_id → nullable + nieuwe ulu_user_id
--      zodat we zonder platform_core kunnen koppelen.
-- =====================================================================

-- 1. Actief-vlag op ulu_users
alter table public.ulu_users
  add column if not exists actief boolean not null default true;

create index if not exists ulu_users_actief_idx
  on public.ulu_users (id) where actief = true;

-- 2. Bijtelling en km-limieten van voertuigen af
-- We LATEN de kolom bijtelling_betaald staan om bestaande data niet te verliezen
-- maar de app gebruikt hem niet meer. Nieuwe inserts moeten hem niet zetten.
-- Om user-intent te respecteren: forceer alle bestaande waardes op false
-- zodat niets meer "aan" staat. De kolom wordt ook uit de UI verwijderd.
update public.voertuigen
   set bijtelling_betaald = false
 where bijtelling_betaald = true;

-- 3. voertuig_bestuurders uitbreiden voor ulu_user-koppeling zonder platform_core
alter table public.voertuig_bestuurders
  alter column medewerker_id drop not null;

alter table public.voertuig_bestuurders
  add column if not exists ulu_user_id bigint;

-- Minstens één van beide gevuld
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'voertuig_bestuurders_heeft_identiteit'
  ) then
    alter table public.voertuig_bestuurders
      add constraint voertuig_bestuurders_heeft_identiteit
      check (medewerker_id is not null or ulu_user_id is not null);
  end if;
end $$;

create index if not exists voertuig_best_ulu_user_idx
  on public.voertuig_bestuurders (ulu_user_id)
  where eind_datum is null and ulu_user_id is not null;

-- Unieke actieve koppeling per voertuig (maar meerdere voertuigen per bestuurder mag)
create unique index if not exists voertuig_best_actief_per_voertuig_uniq
  on public.voertuig_bestuurders (voertuig_id)
  where eind_datum is null;
