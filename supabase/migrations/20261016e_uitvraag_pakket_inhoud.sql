-- Uitvraag bij een leverancier of groothandel: een materiaallijst in plaats van de posten.
-- (Al toegepast in productie, 16-10-2026.)
alter table public.dossier_uitvraag_pakketten
  add column if not exists inhoud text not null default 'posten'
    check (inhoud in ('posten','materialen'));

comment on column public.dossier_uitvraag_pakketten.inhoud is
  'posten = de calculatieregels zoals ze zijn (onderaannemer); materialen = een materiaallijst uit de normen van de posten, samengevoegd en door de calculator nagekeken (leverancier/groothandel). Bij materialen is calculatieregel_id van de posten leeg.';
