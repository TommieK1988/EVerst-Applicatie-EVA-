-- Rechten v2: per kanaal (desktop/mobiel) instelbaar, met losse functies naast de
-- niveaus lezen/schrijven/beheren. Zie packages/database/src/rechten-catalogus.ts.
--
-- Additief. `standaard_rechten` en `rechten_override` blijven bestaan als platte
-- spiegel, want drie plekken lezen ze rechtstreeks in SQL (lib/bouw7/sync.ts,
-- lib/wagenpark/notificaties.ts, lib/wagenpark/compliance-kern.ts). Terugdraaien
-- is daardoor een revert van de code zonder datamigratie.

alter table public.medewerker_afdelingen
  add column if not exists rechten jsonb not null default '{}'::jsonb;
alter table public.medewerkers
  add column if not exists rechten jsonb not null default '{}'::jsonb;

comment on column public.medewerker_afdelingen.rechten is
  'RechtenDocument v2: {versie, desktop:{modules,functies}, mobiel:{...}}. De '
  'afdelingsstandaard. `standaard_rechten` is de platte v1-spiegel en blijft '
  'meelopen zolang er SQL-lezers zijn. Vorm: rechten-catalogus.ts.';

comment on column public.medewerkers.rechten is
  'RechtenDocument v2, de persoonlijke afwijking op de afdeling. Bij modules is '
  'null "expliciet geen" en afwezig "erven"; bij functies doet false dat werk. '
  '`rechten_override` is de platte v1-spiegel.';
