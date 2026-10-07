-- Een stelpost buiten de aanneemsom staat in Bouw7 als meerwerkregel met "stelpost" aangevinkt
-- (additional-work-line, isProvisional). Hier bewaart EVA naar welke Bouw7-regel hij schrijft,
-- zodat een bewerking die regel bijwerkt in plaats van een tweede aan te maken, en de
-- meerwerk-import hem niet nog eens als losse meerwerkregel binnenhaalt.
alter table public.opdracht_onderdelen
  add column if not exists bouw7_line_id bigint,
  add column if not exists bouw7_nummer text;

create unique index if not exists opdracht_onderdelen_bouw7_line_id_uniek
  on public.opdracht_onderdelen (bouw7_line_id) where bouw7_line_id is not null;
