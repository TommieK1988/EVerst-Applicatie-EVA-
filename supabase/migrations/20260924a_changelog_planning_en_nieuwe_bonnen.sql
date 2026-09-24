-- Changelog: ontbrekende planitems in de Medewerkerplanning + nieuwe bonnen die niet binnenkwamen.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-24','opgelost','Planning','Planning uit Bouw7 komt weer volledig binnen',
   'Sommige planitems uit Bouw7 verschenen niet in de Medewerkerplanning. Als je in EVA een balk versleepte die in Bouw7 als hele dag stond, weigerde Bouw7 die wijziging, en daarna werd de planning van dat hele project niet meer bijgewerkt. Verslepen werkt nu ook voor hele-dag-items, en de achtergebleven projecten lopen weer mee.'),
  ('2026-09-24','opgelost','Dossiers','Nieuwe servicedeskbonnen verschijnen weer in EVA',
   'Sinds 21 september kwamen een aantal nieuwe bonnen uit Bouw7 niet in EVA, en werden ongeveer 190 dossiers niet meer bijgewerkt. Eén dossier met een tegenstrijdige status hield de rest tegen. Dat is opgelost: zo''n dossier houdt de andere niet meer op, en alles wordt bij de volgende synchronisatie weer ingehaald.');
