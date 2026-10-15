-- Wat is nieuw: calculatie, regels selecteren alleen nog via het vinkje (live op 15-10-2026).
insert into public.changelog (datum, categorie, module, titel, omschrijving, doelgroep) values
  ('2026-10-15','verbeterd','Calculatie','Regels selecteren alleen nog met het vinkje',
   'Klikken op een regel in de calculatie selecteert die regel niet meer, zodat je niet per ongeluk regels selecteert terwijl je ermee bezig bent. Selecteren doe je met het vinkje vooraan; met Shift-klik op een vinkje selecteer je alle regels daartussen.',
   'kantoor');
