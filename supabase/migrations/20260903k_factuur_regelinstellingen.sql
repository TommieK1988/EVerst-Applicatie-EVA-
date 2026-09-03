-- Per bewakingscode vastleggen hoe hij op de verkoopfactuur komt.
--
-- Op een aangenomen opdracht zit het meeste werk al ín de aanneemsom; dat mag nooit nog eens als
-- regie gefactureerd worden. Alleen twee soorten kosten worden nagecalculeerd:
--   • een MEERWERKREGEL met afrekenwijze 'regie' — daar is afgesproken op nacalculatie af te rekenen;
--   • een STELPOST — die rekent per definitie op werkelijke kosten af.
-- Zit een stelpost al in de aanneemsom (carve-out), dan is alleen het VERSCHIL nog te factureren,
-- en dat loopt al via de verrekening naar een meerwerkregel. Zo'n stelpost hoort dus niet als
-- volledige factuurregel op te duiken — dat zou hem twee keer in rekening brengen.
--
-- Deze tabel bewaart wat er per bewakingscode van gemaakt wordt. Alles is nullable: leeg betekent
-- "gebruik de berekende waarde", zodat een gecorrigeerde regel niet stilzwijgend bevriest als de
-- geboekte kosten daarna nog oplopen.
--
--   • omschrijving      — de tekst die de klant op de factuur ziet; leeg = de naam van de code.
--   • opslag_pct        — opslag op de geboekte kosten; leeg = de bedrijfsstandaard.
--   • bedrag_excl_btw   — HANDMATIGE OVERSCHRIJVING van het bedrag. Bewust een apart veld naast
--                         opslag_pct: een opslag rekent mee met de werkelijke kosten, een vast
--                         bedrag zet dat juist stil. Die twee door één veld halen maakt achteraf
--                         onnavolgbaar of een bedrag berekend of afgesproken was.
--   • uitsplitsen       — uren en kosten binnen deze code als aparte factuurregels tonen.
--   • btw_tarief_bouw7_id — btw per regel; leeg = het tarief dat voor de hele factuur is gekozen.
--   • meefactureren     — uit = deze code hoort niet op deze factuur.
--
-- Sleutel op (dossier, bewakingscode). Bewakingscodes zijn in Bouw7 niet uniek per project maar
-- hoofdstuk-gebonden; dat is hier aanvaardbaar omdat het uitsluitend om stelpost- en
-- meerwerkcodes gaat, die per dossier eenmalig worden uitgegeven.

create table if not exists public.factuur_regelinstellingen (
  id                    uuid primary key default gen_random_uuid(),
  dossier_id            uuid not null references public.dossiers(id) on delete cascade,
  bewakingscode         text not null,
  omschrijving          text,
  opslag_pct            numeric(6,2),
  bedrag_excl_btw       numeric(12,2),
  uitsplitsen           boolean not null default false,
  btw_tarief_bouw7_id   integer,
  meefactureren         boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (dossier_id, bewakingscode)
);

create index if not exists idx_factuur_regelinstellingen_dossier
  on public.factuur_regelinstellingen(dossier_id);

alter table public.factuur_regelinstellingen enable row level security;

drop policy if exists factuur_regelinstellingen_authenticated on public.factuur_regelinstellingen;
create policy factuur_regelinstellingen_authenticated
  on public.factuur_regelinstellingen
  for all
  to authenticated
  using (true)
  with check (true);

comment on column public.factuur_regelinstellingen.bedrag_excl_btw is
  'Handmatige overschrijving van het factuurbedrag. Apart van opslag_pct: een opslag beweegt mee met de geboekte kosten, een vast bedrag niet.';
comment on column public.factuur_regelinstellingen.meefactureren is
  'Uit = deze bewakingscode hoort niet op de factuur. Codes die al in de aanneemsom zitten horen hier nooit in.';
