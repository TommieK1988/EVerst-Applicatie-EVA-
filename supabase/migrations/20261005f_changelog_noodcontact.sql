-- Noodcontact van een medewerker is nu in EVA te bewerken (was alleen-lezen uit Bouw7).
insert into public.changelog (datum, categorie, module, doelgroep, titel, omschrijving) values
  ('2026-10-05','verbeterd','Medewerkers','kantoor','Noodcontact zelf bijhouden',
   'Het noodcontact van een medewerker pas je nu direct aan in EVA, via Bewerken op het tabblad Gegevens. Het hoeft niet meer in Bouw7; wat je hier invult ziet de medewerker ook in de app.');
