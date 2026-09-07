-- Changelog-item: termijnen aanmaken vanaf de Verkoop-tab.

insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-07','nieuw','Facturatie','Termijnen aanmaken zonder omweg via Bouw7',
   'Staan er in een dossier nog geen termijnen, dan maak je ze nu op het tabblad Verkoop zelf aan. Hangt er een betalingsconditie aan de offerte, dan neemt EVA dat schema over — dat is wat de klant heeft geaccepteerd, dus daar moet je expliciet van afwijken. Kent de calculatie geen schema, dan kies je er zelf een of stel je er ter plekke een samen. De bedragen worden op de aanneemsom gerekend, en bij goedgekeurd meerwerk kies je of dat meetelt.');
