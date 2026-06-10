-- =====================================================================
-- Wagenpark — voeg ULU user_id toe aan trips
-- =====================================================================
-- Maakt toekomstige naam-verrijking mogelijk zonder re-sync:
--   - user_id_ulu is de externe id van de ULU-gebruiker (chauffeur)
--   - Kan gejoined worden met een toekomstige `ulu_users` cache-tabel
-- =====================================================================

alter table public.ulu_trips
  add column if not exists user_id_ulu bigint;

create index if not exists ulu_trips_user_id_ulu_idx
  on public.ulu_trips (user_id_ulu)
  where user_id_ulu is not null;

-- Optioneel: cache-tabel voor ULU-users (handig bij latere koppeling aan medewerkers)
create table if not exists public.ulu_users (
  id             bigint primary key,             -- ULU user.id
  email          text,
  firstname      text,
  lastname       text,
  volledige_naam text,
  medewerker_id  uuid,                            -- koppeling naar public.medewerkers (app-level FK)
  laatst_gezien  timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'set_updated_at_ulu_users') then
    create trigger set_updated_at_ulu_users
      before update on public.ulu_users
      for each row execute function public.tg_set_updated_at();
  end if;
end $$;
