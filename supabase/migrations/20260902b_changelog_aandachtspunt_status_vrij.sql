-- Changelog: status van een aandachtspunt/opleverpunt is vrij te wijzigen.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-02','verbeterd','Dossiers','Status van een aandachtspunt in elke richting te wijzigen',
   'De status van een opleverpunt of een aandachtspunt uit een feedbackformulier kon alleen in een vaste volgorde vooruit. Een punt dat per ongeluk op geaccepteerd stond kreeg je niet meer terug op open, en een afgewezen melding kon je niet rechtstreeks op de lijst zetten. Je kiest nu vanuit elke stand elke andere stand, ook terug naar Nieuw of Afgewezen. Zet je een punt weer open, dan vervalt de acceptatiedatum, en bij Afgewezen vraagt EVA net als bij Geweigerd om een reden.');
