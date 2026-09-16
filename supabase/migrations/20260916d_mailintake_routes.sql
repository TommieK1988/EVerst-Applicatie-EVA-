-- Mailintake: de juiste route per mailsoort
--
-- Twee kolommen, allebei nodig om twijfel bij een mens te krijgen.
--
-- 1. standaard_behandelaar_id
--    Een voorgelegd bericht had tot nu toe geen ontvanger. De controletaak ging naar de
--    calculator van het dossier, maar die rol wordt pas later gevuld -- bij een verse
--    aanvraag is hij leeg, en dan hangt de taak aan niemand. Per postbus is er dus iemand
--    die het krijgt zolang er nog geen dossierrollen zijn.
--
-- 2. tasks.mailintake_bericht_id
--    De bestaande ontdubbeling van intake-taken (lib/goedkeuring/taken.ts) filtert op
--    dossier_id. Een voorgelegd bericht heeft nog geen dossier, en PostgREST matcht met
--    `eq` geen NULL -- elke cron-ronde zou dus een nieuwe taak aanmaken voor hetzelfde
--    bericht. Met een eigen verwijzing is de ontdubbeling eenduidig, en kun je vanuit de
--    taak terug naar de mail waar hij vandaan komt.

alter table public.mailintake_postbussen
  add column if not exists standaard_behandelaar_id uuid
    references public.medewerkers(id) on delete set null;

comment on column public.mailintake_postbussen.standaard_behandelaar_id is
  'Wie de actie krijgt als EVA een bericht uit deze postbus voorlegt. Nodig omdat de '
  'dossierrollen (calculator, projectleider) op dat moment nog niet gevuld zijn.';

alter table public.tasks
  add column if not exists mailintake_bericht_id uuid
    references public.mailintake_berichten(id) on delete set null;

comment on column public.tasks.mailintake_bericht_id is
  'Het intake-bericht waar deze taak uit voortkomt. Dient als ontdubbelsleutel: zonder deze '
  'kolom maakt elke verwerkingsronde een nieuwe taak voor hetzelfde bericht.';

create index if not exists idx_tasks_mailintake_bericht_id
  on public.tasks(mailintake_bericht_id)
  where mailintake_bericht_id is not null;

-- De drie standaardbehandelaars. Op e-mailadres gezocht en niet op naam: namen komen dubbel
-- voor (er staan twee medewerkers met de voornaam Tom) en een verkeerde treffer zou de
-- meldingen stil naar de verkeerde persoon sturen.
update public.mailintake_postbussen p
   set standaard_behandelaar_id = m.id
  from public.medewerkers m
 where m.email = 'bas@everts.chat'
   and p.sleutel = 'offerteaanvragen'
   and p.standaard_behandelaar_id is null;

update public.mailintake_postbussen p
   set standaard_behandelaar_id = m.id
  from public.medewerkers m
 where m.email = 'tom@everts.chat'
   and p.sleutel = 'opdrachten'
   and p.standaard_behandelaar_id is null;

update public.mailintake_postbussen p
   set standaard_behandelaar_id = m.id
  from public.medewerkers m
 where m.email = 'marga@everts.chat'
   and p.sleutel = 'servicedesk'
   and p.standaard_behandelaar_id is null;
