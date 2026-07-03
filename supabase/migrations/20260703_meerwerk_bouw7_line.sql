-- Echte Bouw7-meerwerkregel als importbron (GET /list/additional-work-lines).
--
-- De eerder gekozen bronnen (bewakingscode-bedrag, offerteregel) waren niet de echte
-- meerwerkregel-entiteit. Bouw7 heeft een first-class meerwerkregel (MW-nummer, executor, offerte,
-- begroot/verkoopprijs, isProvisional=stelpost, status). Deze migratie voegt 'bouw7_line' als bron toe
-- en velden voor traceerbaarheid.

alter table public.meerwerk_regels drop constraint if exists meerwerk_regels_bron_check;
alter table public.meerwerk_regels
  add constraint meerwerk_regels_bron_check
  check (bron in ('eva','bouw7_code','bouw7_offerte','bouw7_line'));

alter table public.meerwerk_regels
  add column if not exists bouw7_line_id  bigint,
  add column if not exists bouw7_nummer   text,
  add column if not exists begroot_bedrag numeric(12,2);

comment on column public.meerwerk_regels.bouw7_line_id is
  'Bouw7 additional-work-line id (GET /list/additional-work-lines) waaruit deze regel is geïmporteerd.';
comment on column public.meerwerk_regels.bouw7_nummer is
  'Bouw7 meerwerknummer, bv. "MW003".';
comment on column public.meerwerk_regels.begroot_bedrag is
  'Begroot bedrag (kostprijs) uit Bouw7 (budgetAmount); verkoopprijs staat in bedrag_excl_btw.';
