-- Changelog: één opslag% per calculatie, instelbaar in de totalenbalk.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-08-31','verbeterd','Calculatie','Opslag instellen voor de hele calculatie',
   'Onderin de calculatie staat nu een veld Opslag %. Vul je daar een percentage in, dan '
   'krijgen alle regels dat na een bevestiging; daarna kun je per regel alsnog een afwijkend '
   'percentage invullen. Een regel op 0% gaat voortaan echt tegen kostprijs de offerte in.'),
  ('2026-08-31','opgelost','Offertes','Offertebedrag volgt nu altijd de calculatie',
   'Bij het maken van een offerte kregen regels zonder eigen opslag soms een vast opslagpercentage '
   'van 18% opgeteld, ook als de calculatie iets anders aangaf. Het offertebedrag komt nu altijd '
   'overeen met wat je in de calculatie ziet staan. Controleer offertes die je hiervoor al had '
   'aangemaakt en maak ze zo nodig opnieuw aan.');
