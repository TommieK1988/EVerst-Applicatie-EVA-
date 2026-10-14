-- Opleverrapport naar het voorbeeld van het team (Vlietkinderen Piggelmee):
--  * punten vastleggen die góéd zijn uitgevoerd (foto + omschrijving, meteen akkoord);
--  * per oplevermoment vrije tekst "Afspraken" naast de al bestaande "opmerking"
--    (die tot nu toe nergens te bewerken was en nu "Algemene opmerkingen" heet).
--
-- Een goed punt is een gewone rij met is_goed = true en status 'geaccepteerd'. Bewust geen nieuwe
-- status of soort: 'geaccepteerd' telt overal al als afgerond (herinneringen, gereed-controle,
-- betaalsignaal, automatisch 'gereed voor ondertekening'), en op `soort = 'oplever'` wordt op vijf
-- plekken gefilterd — een nieuwe soort zou de punten daar laten verdwijnen.

alter table public.oplever_punten
  add column if not exists is_goed boolean not null default false;

comment on column public.oplever_punten.is_goed is
  'Punt dat goed is uitgevoerd (foto + omschrijving in het opleverrapport); altijd status geaccepteerd, geen toewijzing.';

alter table public.oplever_momenten
  add column if not exists afspraken text;

comment on column public.oplever_momenten.opmerking is 'Algemene opmerkingen in het opleverrapport.';
comment on column public.oplever_momenten.afspraken is 'Gemaakte afspraken in het opleverrapport.';
