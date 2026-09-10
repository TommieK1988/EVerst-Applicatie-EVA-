-- Gevraagde werkzaamheden: de scope-samenvatting uit mail plus bijlagen.
-- Toegepast op 2026-09-10 via de Supabase MCP.
--
-- Waarom een eigen veld en niet dossiers.opmerkingen: dat veld wordt in het
-- dossierscherm nergens getoond (het staat wel in FormValues van InformatieTab,
-- maar er is geen invoerveld voor), het gaat bij aanmaken naar Bouw7 als
-- `information`, en de lees-sync haalt dat via syncDossierNotities weer terug
-- als notitie "Omschrijving (Bouw7)". De tekst zou dus op twee plekken tegelijk
-- staan en bij een volle sync kunnen verspringen. Een EVA-eigen veld kan de
-- Bouw7-sync per definitie niet overschrijven.

-- ── 1. Op het intakebericht ─────────────────────────────────────────────────
alter table public.mailintake_berichten
  add column if not exists gevraagde_werkzaamheden text,
  add column if not exists gevraagde_werkzaamheden_bronnen text[] not null default '{}',
  add column if not exists gevraagde_werkzaamheden_gemist text[] not null default '{}',
  add column if not exists gevraagde_werkzaamheden_op timestamptz;

-- ── 2. Tweede ronde in dezelfde tabel ───────────────────────────────────────
-- De samenvatting is een aparte AI-aanroep met een heel ander budget dan de
-- veldextractie. Door hem als tweede `ronde` in mailintake_extracties te zetten
-- houdt hij zijn eigen versienummering en blijft de kostenmeter werken zonder
-- aanpassing: die telt gewoon kosten_cent per ronde.
--
-- Let op de kolomnaam: `soort` was al bezet op deze tabel en betekent daar de
-- soort van de MAIL ('offerteaanvraag', 'opdrachtbon', ...). Vandaar `ronde`.
alter table public.mailintake_extracties
  add column if not exists ronde text not null default 'velden';

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.mailintake_extracties'::regclass
      and conname = 'mailintake_extracties_ronde_check'
  ) then
    alter table public.mailintake_extracties
      add constraint mailintake_extracties_ronde_check
      check (ronde in ('velden', 'werkzaamheden'));
  end if;
end $$;

drop index if exists public.mailintake_extracties_uniek;
create unique index if not exists mailintake_extracties_uniek
  on public.mailintake_extracties (bericht_id, ronde, versie);

-- ── 3. Op het dossier ───────────────────────────────────────────────────────
alter table public.dossiers
  add column if not exists gevraagde_werkzaamheden text,
  -- Leesbare herkomst, bv. "Opgesteld uit de aanvraagmail en 3 bijlagen (9 sep 2026)".
  add column if not exists gevraagde_werkzaamheden_bron text,
  add column if not exists gevraagde_werkzaamheden_op timestamptz;

-- ── 4. Ruimer dagbudget ─────────────────────────────────────────────────────
-- De samenvattingsronde leest hele bestekken en kost bij een dik document 40-60
-- cent. Met het oude budget van EUR 5 per postbus is dat na een handvol
-- aanvragen op. Raakt het budget alsnog op, dan valt alleen de samenvatting weg,
-- nooit de veldextractie.
alter table public.mailintake_postbussen
  alter column dagbudget_cent set default 2000;

update public.mailintake_postbussen
set dagbudget_cent = 2000
where dagbudget_cent = 500;
