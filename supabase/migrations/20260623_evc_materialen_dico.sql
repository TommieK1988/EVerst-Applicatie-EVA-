-- 20260623_evc_materialen_dico.sql
--
-- Materialen Bibliotheek van browser-localStorage naar Supabase + DICO-koppeling.
--   1. evc_materialen   — gedeelde materialenbibliotheek (was localStorage `evc_materialen`),
--                         uitgebreid met DICO/ETIM-velden voor catalogus-import/sync.
--   2. dico_integraties — connector-config per leverancier voor de live DICO API-sync
--                         (bevat credentials → uitsluitend server-/service-role-toegang).
--
-- Idempotent: veilig opnieuw te draaien.

-- ── 1. Materialenbibliotheek ────────────────────────────────────────────────────
create table if not exists public.evc_materialen (
  id              uuid primary key default gen_random_uuid(),
  leverancier     text,
  artikelnummer   text,
  omschrijving    text not null,
  materiaalgroep  text,
  eenheid         text not null default 'ltr',
  kostprijs       numeric not null default 0,
  status          text not null default 'actief' check (status in ('actief','inactief')),

  -- DICO / Ketenstandaard / ETIM
  gtin            text,                                  -- EAN/GTIN
  etim_klasse     text,                                  -- ETIM-klassecode (bv. EC010101)
  leverancier_gln text,                                  -- GLN van de leverancier
  bron            text not null default 'handmatig'
                    check (bron in ('handmatig','excel','dico_import','dico_api')),
  externe_ref     text,                                  -- bron-id uit DICO-bericht
  gesynct_op      timestamptz,                           -- laatste DICO-sync van deze regel

  aangepast_op    timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

-- Opzoek-indexen voor import-matching en zoekveld.
create index if not exists idx_evc_materialen_lev_art on public.evc_materialen(leverancier, artikelnummer);
create index if not exists idx_evc_materialen_gtin    on public.evc_materialen(gtin);
create index if not exists idx_evc_materialen_status  on public.evc_materialen(status);

-- RLS-basislijn conform 20260616c: anon geblokkeerd, ingelogde gebruiker toegestaan,
-- service-role omzeilt RLS.
alter table public.evc_materialen enable row level security;
drop policy if exists app_authenticated_all on public.evc_materialen;
create policy app_authenticated_all on public.evc_materialen
  for all to authenticated using (true) with check (true);

-- ── 2. DICO-integratie-config (live API-sync) ───────────────────────────────────
create table if not exists public.dico_integraties (
  id             uuid primary key default gen_random_uuid(),
  leverancier    text not null,
  endpoint_url   text,
  auth_type      text not null default 'none'
                   check (auth_type in ('none','basic','bearer','apikey')),
  auth_gebruiker text,                                   -- basic-gebruiker of api-key-naam
  auth_geheim    text,                                   -- wachtwoord/token/api-key (server-only)
  actief         boolean not null default true,
  laatst_gesynct timestamptz,
  laatste_status text,                                   -- vrije tekst: laatste sync-resultaat
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Credentials: nooit client-/sessie-toegankelijk. RLS aan, geen policy → uitsluitend
-- de admin-client (service-role) kan erbij. Zelfde patroon als medewerker_o365_tokens.
alter table public.dico_integraties enable row level security;
drop policy if exists app_authenticated_all on public.dico_integraties;
