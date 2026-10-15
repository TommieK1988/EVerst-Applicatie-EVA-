-- Wat is nieuw: uren na indienen per regel op slot, deadline maandag 15:00 (live op 15-10-2026).
insert into public.changelog (datum, categorie, module, titel, omschrijving, doelgroep) values
  ('2026-10-15','verbeterd','Uren','Ingediende uren blijven langer aan te passen',
   'Heeft een medewerker zijn week te vroeg ingediend, dan kan hij zijn uren nog aanpassen tot maandag 15:00. Alleen de regels die de teamleider of projectleider al heeft goedgekeurd, liggen vast; de rest van de week niet meer.',
   'kantoor'),
  ('2026-10-15','verbeterd','Uren','Je uren nog aanpassen na indienen',
   'Week te vroeg ingediend? Je kunt je uren nog aanpassen tot maandag 15:00. Uren die al zijn goedgekeurd, zie je met Goedgekeurd erbij; die kun je niet meer veranderen.',
   'mobiel');
