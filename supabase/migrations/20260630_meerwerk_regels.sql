-- Meerwerk-regels — EVA-native werkstroom voor meerwerk per opdracht-dossier.
--
-- Eén rij = één meerwerkpost met eigen statusmachine, regie/aangenomen-afrekening, optionele
-- stelpost, eigen factuurreferentie en (bij akkoord) een eigen bewakingscode in Bouw7. Volgt het
-- patroon van regie_factuurregels / inkoop_correcties / debiteuren: EVA is leidend, met selectieve
-- terugschrijving naar Bouw7 (bewakingscode + prognose). Factuur/termijn naar Bouw7 = latere fase.

create table if not exists public.meerwerk_regels (
  id                      uuid primary key default gen_random_uuid(),
  dossier_id              uuid not null references public.dossiers(id) on delete cascade,
  volgnummer              int  not null default 1,            -- per dossier oplopend (weergave "MW-01")
  omschrijving            text not null,                      -- naam meerwerk (= bewakingscode-naam)
  status                  text not null default 'aangevraagd'
                            check (status in ('aangevraagd','offerte_verstuurd','akkoord','afgewezen','voltooid')),
  afrekenwijze            text not null default 'aangenomen'
                            check (afrekenwijze in ('regie','aangenomen')),
  is_stelpost             boolean not null default false,
  stelpost_grondslag      text
                            check (stelpost_grondslag in ('geboekte_kosten','eenheidsprijzen')),
  bedrag_excl_btw         numeric(12,2),                      -- aangenomen/handmatig bedrag; bij regie live berekend
  eenheid                 text,                               -- stelpost-eenheidsprijzen
  eenheidsprijs           numeric(12,2),                      -- stelpost-eenheidsprijzen
  hoeveelheid_werkelijk   numeric(12,2),                      -- stelpost-eenheidsprijzen: werkelijk verbruik
  btw_pct                 numeric(5,2),                       -- default afgeleid in app (9% arbeid / 21% materiaal)
  factuurreferentie       text,
  termijn_wijze           text
                            check (termijn_wijze in ('eigen_termijnstaat','een_regel')),
  bewakingscode           text,                               -- kale code aangemaakt in Bouw7
  bouw7_security_code_id  bigint,
  bouw7_chapter_id        bigint,
  quote_id                uuid,                               -- gekoppelde "Meerwerk offerte"
  afgewezen_reden         text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  created_by              uuid
);

create index if not exists idx_meerwerk_regels_dossier on public.meerwerk_regels(dossier_id);

comment on table public.meerwerk_regels is
  'EVA-native meerwerkregels per opdracht-dossier: status, regie/aangenomen, stelpost, factuurreferentie; bij akkoord eigen bewakingscode + prognose naar Bouw7. Som akkoord-regels = leidend meerwerk in contracttotaal.';

-- RLS-basislijn conform 20260616c.
alter table public.meerwerk_regels enable row level security;
drop policy if exists app_authenticated_all on public.meerwerk_regels;
create policy app_authenticated_all on public.meerwerk_regels
  for all to authenticated using (true) with check (true);

-- Back-reference op quotes zodat de calculatie-tab een "Meerwerk offerte" kan onderscheiden van de
-- hoofdcalculatie van het dossier.
alter table public.quotes add column if not exists meerwerk_regel_id uuid;

comment on column public.quotes.meerwerk_regel_id is
  'Indien gezet: deze offerte/calculatie hoort bij een meerwerkregel (public.meerwerk_regels.id), label "Meerwerk offerte".';
