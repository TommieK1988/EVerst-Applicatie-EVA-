-- Archiveren in plaats van verwijderen: offerte-stamdata en verzonden offertes.
--
-- Aanleiding (2 okt 2026): algemene voorwaarden die nog op ~40 calculaties en 33
-- verzonden offertes stonden zijn verwijderd. De FK op quotes stond op ON DELETE SET
-- NULL, dus verzonden offertes verloren stil hun voorwaarden; calculaties (JSON-blob,
-- geen FK) bleven naar een niet-bestaand id wijzen en "Interne begroting" faalde.
-- Daarnaast wezen opdracht-onderdelen naar een offerte die verwijderd was.
--
-- Regel (zie DEVELOPMENT_STANDARDS.md §5.5): iets waar een document of een andere rij
-- naar kan wijzen wordt gearchiveerd, niet verwijderd. De database dwingt dat af.

-- 1. Archiefkolom op de stamdata die een offerte kiest.
alter table public.algemene_voorwaarden add column if not exists gearchiveerd_op timestamptz;
alter table public.betalingscondities   add column if not exists gearchiveerd_op timestamptz;
alter table public.quote_layouts        add column if not exists gearchiveerd_op timestamptz;

comment on column public.algemene_voorwaarden.gearchiveerd_op is
  'Gezet = niet meer te kiezen voor nieuwe offertes; bestaande offertes houden hem. Nooit verwijderen.';
comment on column public.betalingscondities.gearchiveerd_op is
  'Gezet = niet meer te kiezen voor nieuwe offertes; bestaande offertes houden hem. Nooit verwijderen.';
comment on column public.quote_layouts.gearchiveerd_op is
  'Gezet = niet meer te kiezen voor nieuwe offertes; bestaande offertes houden hem. Nooit verwijderen.';

-- Vervolg: 20261002i (FK's) en 20261002j (verzonden offerte onverwijderbaar).
