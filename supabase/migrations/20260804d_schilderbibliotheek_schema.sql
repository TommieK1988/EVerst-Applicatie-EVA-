-- Schilderbibliotheek — schema klaarmaken voor de Calc4You-import
--
-- Aanleiding: `Bibliotheek - Onderhoud..c4y` bevat de volledige onderhoudsnormen
-- als behandeling × onderdeel-matrix (91 behandelingen × 116 onderdeeltypes =
-- 842 cellen). De schilderbibliotheek in EVA past daar 1:1 op maar is vrijwel
-- leeg (4 onderdelen, 14 types, 6 behandelingen, 11 combinaties), waardoor elke
-- schilderregel in de calculatie nog handmatig genormeerd moet worden.
--
-- Deze migratie is puur ADDITIEF: alleen nieuwe kolommen, indexen en constraints.
-- Er wordt geen bestaande rij gewijzigd of verwijderd.
--
-- Twee ontwerpkeuzes die hier landen:
--
-- 1. `bron_code` als natuurlijke sleutel. De Calc4You-regelcode (`OHD03-khn-m¹`)
--    is de enige betrouwbare identificatie in het bronbestand — de omschrijving
--    niet, want dezelfde code heet per behandeling anders en bevat typefouten
--    ("kozijnen 10-20cm" / "Kozijnen hout 10-20cm" / "Hout kozijnen 10-20cm").
--    Door de code vast te leggen wordt een herhaalde import idempotent.
--
-- 2. `schilder_*` wordt de bron, `paint_*` een gespiegelde kopie. De recepten-
--    bibliotheek toont de schilderrecepten dus wél, maar ze zijn daar niet te
--    bewerken (`vergrendeld`). Zo kunnen de twee bibliotheken niet uit elkaar
--    lopen. De spiegeling zelf zit in de volgende migratie.

-- ---------------------------------------------------------------------------
-- schilder_behandelingen
-- ---------------------------------------------------------------------------

-- Deze twee kolommen bestaan al in de database maar staan in geen enkele
-- migratie (ze zijn ooit rechtstreeks via de SQL-editor toegevoegd). Hier alsnog
-- vastgelegd zodat `supabase/migrations` de database daadwerkelijk reproduceert.
alter table public.schilder_behandelingen
  add column if not exists korte_omschrijving text,
  add column if not exists uitgebreide_werkomschrijving text;

-- Ondergrond uit de c4y-hoofdgroep (OH/OK/OM/OS). Maakt filteren per ondergrond
-- mogelijk in de behandeling-picker.
alter table public.schilder_behandelingen
  add column if not exists ondergrond text
    check (ondergrond is null or ondergrond in ('hout','kunststof','metaal','steenachtig'));

-- Buiten- of binnenschilderwerk. In het OnderhoudNL-bestek zijn dat aparte
-- hoofdstukken met een disjuncte nummering: 01-12 = buiten, 50-60 = binnen.
alter table public.schilder_behandelingen
  add column if not exists toepassing text
    check (toepassing is null or toepassing in ('buiten','binnen'));

create unique index if not exists schilder_behandelingen_code_uniek
  on public.schilder_behandelingen (code);

-- ---------------------------------------------------------------------------
-- schilder_onderdelen
-- ---------------------------------------------------------------------------

alter table public.schilder_onderdelen
  add column if not exists ondergrond text
    check (ondergrond is null or ondergrond in ('hout','kunststof','metaal','steenachtig'));

create unique index if not exists schilder_onderdelen_code_uniek
  on public.schilder_onderdelen (code);

-- ---------------------------------------------------------------------------
-- schilder_types
-- ---------------------------------------------------------------------------

-- De c4y-suffix (`khn-m¹`, `ho-m²`). Niet alleen `code`, omdat één onderdeel
-- twee types met dezelfde naam maar een andere eenheid kan hebben: `ho-m²` en
-- `ho-m¹` heten in de bron allebei "houten oppervlakken".
alter table public.schilder_types
  add column if not exists bron_code text;

create unique index if not exists schilder_types_onderdeel_bron_code_uniek
  on public.schilder_types (onderdeel_id, bron_code);

-- ---------------------------------------------------------------------------
-- schilder_combinaties
-- ---------------------------------------------------------------------------

-- De volledige c4y-regelcode (`OHD03-khn-m¹`) — de sleutel waarop de import
-- upsert, zodat opnieuw draaien niets dupliceert.
alter table public.schilder_combinaties
  add column if not exists bron_code text;

create unique index if not exists schilder_combinaties_bron_code_uniek
  on public.schilder_combinaties (bron_code);

-- ---------------------------------------------------------------------------
-- schilder_arbeid_normen
-- ---------------------------------------------------------------------------

-- Verwijst naar `bedrijfsinstellingen.uurtarieven[].label`, net als
-- `paint_labor_norms.uurtarief_label`. `hour_rate` blijft de doorgerekende
-- waarde; het label maakt het mogelijk de hele bibliotheek mee te laten bewegen
-- als het uurtarief wijzigt. Calc4You rekende met € 45,00 — precies het tarief
-- dat in EVA onder het label 'Arbeid schilder' staat.
alter table public.schilder_arbeid_normen
  add column if not exists uurtarief_label text;

-- ---------------------------------------------------------------------------
-- paint_items — vergrendeling en herkomst
-- ---------------------------------------------------------------------------

-- Een gespiegeld recept wijst terug naar zijn combinatie. `on delete cascade`:
-- verdwijnt de combinatie, dan verdwijnt de spiegel mee.
alter table public.paint_items
  add column if not exists schilder_combinatie_id uuid
    references public.schilder_combinaties(id) on delete cascade;

-- Vergrendelde recepten worden elders beheerd en mogen in de recepten-
-- bibliotheek niet gewijzigd worden. De server actions dwingen dit af; deze
-- kolom is de bron van waarheid daarvoor.
alter table public.paint_items
  add column if not exists vergrendeld boolean not null default false;

create unique index if not exists paint_items_schilder_combinatie_uniek
  on public.paint_items (schilder_combinatie_id);

comment on column public.paint_items.vergrendeld is
  'Recept wordt beheerd in de Schilderwerkbibliotheek en is hier alleen-lezen.';
comment on column public.paint_items.schilder_combinatie_id is
  'Bron-combinatie waaruit dit recept gespiegeld is (zie spiegel_schilder_naar_recept).';
