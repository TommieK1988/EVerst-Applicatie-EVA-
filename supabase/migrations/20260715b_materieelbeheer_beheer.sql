-- Materieelbeheer — beheer/instellingen (tijdgevoelige config, singleton)
--
-- Zaken die in de tijd wijzigen en die de gebruiker zelf moet kunnen beheren:
--  * controlefrequentie + waarschuwingstermijnen (keuring/APK/garantie)
--  * de lijst met keuringsoorten (APK, CE, elektra, …)
-- Teams (servicebussen, keten, ploegen) staan al in materieel_teams.
--
-- Singleton-patroon: precies één rij (id = 1). De app leest/schrijft die ene rij.

create table if not exists public.materieel_instellingen (
  id                          integer primary key default 1 check (id = 1),
  controle_frequentie         text not null default 'maandelijks',   -- 'maandelijks' | 'per_kwartaal' | 'halfjaarlijks' | 'jaarlijks'
  controle_moment             text not null default 'eerste_maandag', -- vrij label voor wanneer in de periode
  keuring_waarschuwing_dagen  integer not null default 30,
  apk_waarschuwing_dagen      integer not null default 30,
  garantie_waarschuwing_dagen integer not null default 30,
  keuring_soorten             jsonb  not null default
    '[{"key":"apk","label":"APK"},{"key":"ce","label":"CE-keuring"},{"key":"elektra","label":"Elektrakeuring (NEN 3140)"},{"key":"veiligheid","label":"Veiligheidskeuring"}]'::jsonb,
  updated_at                  timestamptz not null default now()
);

-- Seed de enige rij (idempotent).
insert into public.materieel_instellingen (id) values (1)
on conflict (id) do nothing;

drop trigger if exists trg_materieel_instellingen_touch on public.materieel_instellingen;
create trigger trg_materieel_instellingen_touch before update on public.materieel_instellingen
  for each row execute function public.materieel_touch_updated_at();

-- RLS — platform-gebruiker-policy (zelfde patroon als de rest van de module).
alter table public.materieel_instellingen enable row level security;
drop policy if exists platform_gebruikers_all on public.materieel_instellingen;
create policy platform_gebruikers_all on public.materieel_instellingen
  for all to authenticated using (is_platform_gebruiker()) with check (is_platform_gebruiker());
