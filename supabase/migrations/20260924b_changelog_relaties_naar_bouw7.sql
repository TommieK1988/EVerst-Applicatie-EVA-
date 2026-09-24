-- Changelog: relatiewijzigingen komen weer in Bouw7 aan; calculator zonder Bouw7-account.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-24','opgelost','Relaties','Wijzigingen aan een relatie komen weer in Bouw7 aan',
   'Wat je in EVA aan een relatie wijzigt, gaat nu betrouwbaar mee naar Bouw7, en daar horen voortaan ook het land en de betaaltermijn bij. Eerder weigerde Bouw7 de wijziging bij sommige relaties, bijvoorbeeld door een btw-nummer met puntjes of een ontbrekende "Soort opdrachtgever"; EVA vult dat nu zelf goed aan. Een relatie op inactief zetten blijft alleen in EVA.'),
  ('2026-09-24','opgelost','Dossiers','Calculator zonder Bouw7-account komt toch in Bouw7',
   'Kies je als calculator iemand die geen eigen Bouw7-account heeft, dan weigerde Bouw7 dat. De naam komt nu in het Bouw7-veld "Calculator" te staan, zodat de rol niet verloren gaat.');
