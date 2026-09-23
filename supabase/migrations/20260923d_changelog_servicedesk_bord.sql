-- Changelog: bonnen stonden dubbel en in de verkeerde kolom.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-23','opgelost','Servicedesk','Bonnen stonden dubbel tussen de aanvragen en offertes',
   'Een bon van Dagelijks onderhoud of Mutatie stond niet alleen op het servicedeskbord maar ook tussen de aanvragen en de offertes. Dat is verholpen: een bon staat nu alleen nog op Servicedesk. Daardoor zie je op de Aanvragen- en Offertes-borden alleen nog echt commercieel werk.'),

  ('2026-09-23','opgelost','Servicedesk','Nieuwe bonnen komen niet meer op "Offerte uitgebracht"',
   'Een bon die in Bouw7 op "01. Offerte" staat kwam meteen in de kolom Offerte uitgebracht terecht, terwijl er nog niets verstuurd was — je moest hem daar elke keer handmatig uit slepen. Voortaan begint zo''n bon op Nieuw. Is er in Bouw7 wél een offerte verstuurd, dan staat hij gewoon bij Offerte uitgebracht.');
