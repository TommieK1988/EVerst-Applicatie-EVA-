-- Meertaligheid EVA Mobiel (/m): de taal waarin een medewerker de app gebruikt.
--
-- Alleen de app op de telefoon is meertalig; het kantoordeel blijft Nederlands.
-- 'nl' = Nederlands, 'pl' = Pools, 'ta' = Tamil (Sri Lanka).
-- De medewerker kiest zelf (Profiel → Instellingen) of kantoor zet het op de
-- medewerkerkaart. Zie docs/plan-meertaligheid-app.md.
--
-- Additief en met standaardwaarde: bestaande medewerkers blijven Nederlands, en code
-- die de kolom niet kent merkt niets.

alter table public.medewerkers
  add column if not exists taal text not null default 'nl';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'medewerkers_taal_check'
  ) then
    alter table public.medewerkers
      add constraint medewerkers_taal_check check (taal in ('nl', 'pl', 'ta'));
  end if;
end $$;

comment on column public.medewerkers.taal is
  'Taal van EVA Mobiel voor deze medewerker: nl, pl of ta. Kantoordeel blijft Nederlands.';
