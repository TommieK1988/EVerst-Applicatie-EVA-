-- Wat is nieuw: maten met een komma (live op 14-10-2026, PR #31).
insert into public.changelog (datum, categorie, module, titel, omschrijving, doelgroep) values
  ('2026-10-14','verbeterd','Calculatie','Meetstaat: maten typ je nu met een komma',
   'In de meetstaat en de mini-meetstaat typ je maten zoals op de papieren opmeetstaat: 2,40 in plaats van 2.40. Een punt mag ook nog. Het overzicht "Naar calculatie" staat standaard ingeklapt, zodat de meetregels meer ruimte krijgen; klik erop om het te openen.',
   'kantoor');
