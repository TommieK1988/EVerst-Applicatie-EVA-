-- Wat is nieuw: calculatie begint met het ★-uurtarief, eigen tarief per regel blijft staan (live op 16-10-2026).
insert into public.changelog (datum, categorie, module, titel, omschrijving, doelgroep) values
  ('2026-10-16','opgelost','Calculatie','Calculatie begint met het ingestelde uurtarief',
   'Het uurtarief onderin een calculatie bleef vaak leeg. Een calculatie neemt nu het uurtarief met de ster uit Stamgegevens → Uren → Uurtarieven over. Wijzig je het tarief, dan gaan alleen de regels mee die het calculatietarief volgen; een regel met een eigen tarief (bijvoorbeeld een uitvoerder) blijft staan, en Controle laat zo''n regel nakijken.',
   'kantoor');
