-- Per-dossier instelbare locatieniveaus (max 3), door de projectleider in EVA
-- bepaald. De vakman kiest in de app uit deze niveaus. Vorm van `niveaus`:
--   [{"naam":"Gevelzijde","opties":["Voorgevel","Achtergevel"]}, ...]  (max 3)
--
-- Toegepast op productie via de Supabase MCP op 2026-07-29.
create table if not exists public.houtrot_dossier_config (
  dossier_id  uuid primary key references public.dossiers(id) on delete cascade,
  niveaus     jsonb not null default '[]'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table public.houtrot_dossier_config enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='houtrot_dossier_config'
      and policyname='platform_gebruiker_toegang'
  ) then
    create policy platform_gebruiker_toegang
      on public.houtrot_dossier_config
      for all to authenticated
      using (is_platform_gebruiker())
      with check (is_platform_gebruiker());
  end if;
end $$;

grant all on public.houtrot_dossier_config to anon, authenticated, service_role;

-- Registratie: gekozen locatiewaarden als [{"naam":..,"waarde":..}] (of één vrij
-- 'Locatie'-veld bij dossiers zonder ingestelde niveaus), plus een vlag die de
-- automatische status (uit de foto's) uitschakelt ten gunste van een handmatige.
alter table houtrotherstel.repair_registrations
  add column if not exists locatie jsonb not null default '[]'::jsonb;
alter table houtrotherstel.repair_registrations
  add column if not exists status_handmatig boolean not null default false;

notify pgrst, 'reload schema';
