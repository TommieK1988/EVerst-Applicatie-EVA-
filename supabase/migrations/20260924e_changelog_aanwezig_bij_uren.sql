-- Wat is nieuw: netto aanwezig naast de geboekte uren bij het keuren.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-24','verbeterd','Uren','Bij het keuren zie je hoe lang iemand op het werk was',
   'Naast de te keuren uren staat nu per medewerker per dag hoe lang de auto op het werk stond (aankomst tot vertrek, min de pauze), tegenover alle uren die die dag geboekt zijn. Wijkt dat meer dan een half uur af, dan kleurt het verschil oranje. Op de computer kun je groeperen op "Medewerker + dag"; op de telefoon staat het boven elke dag.');
