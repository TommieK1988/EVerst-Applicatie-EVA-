-- Btw-tarief per werkzaamheid, met afwijkingen per opdrachtgever en per dossier.
--
-- De basis staat in de eenheidsprijs: `public.paint_items.btw_tarief` ('hoog' |
-- 'laag'). Dat is een tekstcode uit de calculatiebibliotheek, geen verwijzing naar
-- de stamtabel `btw_tarieven`, en hij kent geen verlegde tarieven. Deze tabel legt
-- daar afwijkingen overheen: per opdrachtgever (bv. een corporatie die alles
-- verlegd factureert) en per dossier (bv. nieuwbouw binnen dezelfde corporatie).
--
-- Voorrang bij het bepalen van het tarief van één werkzaamheid:
--   1. afwijking op het dossier
--   2. afwijking bij de opdrachtgever (dossiers.klant_id → relaties)
--   3. de code in de eenheidsprijs
--   4. Hoog 21%
--
-- Precies één van `dossier_id` / `relatie_id` is gevuld; de check dwingt dat af.
--
-- Toegepast op productie via de Supabase MCP op 2026-09-11.
create table if not exists public.houtrot_btw_tarieven (
  id            uuid primary key default gen_random_uuid(),
  dossier_id    uuid references public.dossiers(id) on delete cascade,
  relatie_id    uuid references public.relaties(id) on delete cascade,
  recept_id     uuid not null references public.paint_items(id) on delete cascade,
  btw_tarief_id uuid not null references public.btw_tarieven(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint houtrot_btw_een_niveau check (num_nonnulls(dossier_id, relatie_id) = 1)
);

create unique index if not exists houtrot_btw_dossier_recept_uniek
  on public.houtrot_btw_tarieven (dossier_id, recept_id) where dossier_id is not null;
create unique index if not exists houtrot_btw_relatie_recept_uniek
  on public.houtrot_btw_tarieven (relatie_id, recept_id) where relatie_id is not null;

alter table public.houtrot_btw_tarieven enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='houtrot_btw_tarieven'
      and policyname='platform_gebruiker_toegang'
  ) then
    create policy platform_gebruiker_toegang
      on public.houtrot_btw_tarieven
      for all to authenticated
      using (is_platform_gebruiker())
      with check (is_platform_gebruiker());
  end if;
end $$;

grant all on public.houtrot_btw_tarieven to anon, authenticated, service_role;

notify pgrst, 'reload schema';
