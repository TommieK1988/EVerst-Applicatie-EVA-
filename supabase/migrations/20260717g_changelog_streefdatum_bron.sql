insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-07-17','opgelost','Taken','Streefdatum werkt nu ook bij automatische checklists',
   'Taken met een deadline "vóór de streefdatum" bleven zonder deadline wanneer een checklist automatisch werd geactiveerd — er was dan immers niemand die een streefdatum invulde. Je stelt nu per sjabloon in wat de streefdatum is: zelf invullen bij het activeren, of de verwachte start- of einddatum van het dossier. Schuift die datum, dan schuiven de deadlines mee.');
