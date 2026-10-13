-- Kantoorwerk voor meer dan één werkmaatschappij.
--
-- Wie op kantoor zit kiest geen project: zijn gewerkte uren gaan naar het gewerkte
-- indirecte-urenproject van zijn werkmaatschappij (of, bij een extern, naar
-- uren_instellingen.extern_kantoor_dossier_id). Iemand die voor twee bedrijven kantoorwerk doet
-- (John Reedijk: Morgenstond én Onderhoudsschilders) kon zo maar één kant op.

alter table public.medewerkers
  add column if not exists kantoor_werkmaatschappij_ids uuid[] not null default '{}';

comment on column public.medewerkers.kantoor_werkmaatschappij_ids is
  'Werkmaatschappijen waarvoor deze medewerker kantoorwerk doet. Leeg = de eigen werkmaatschappij '
  '(of extern_kantoor_dossier_id bij externen). Eén = altijd die. Meer dan één = de medewerker '
  'kiest per urenregel in de app.';
