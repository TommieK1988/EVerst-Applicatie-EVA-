-- Changelog-item: alle lijstwidgets op zeven regels en dezelfde regelopmaak.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-09', 'verbeterd', 'Dashboard',
   'Alle kaartjes op je startscherm tonen nu zeven regels',
   'De kaartjes op het startscherm lieten niet allemaal evenveel zien: Mijn acties toonde er zes, '
   'het nieuws vier en de rest zeven. Een kaartje dat halfleeg staat naast een volle lijst lijkt '
   'leger dan het is. Alles staat nu op zeven regels, in dezelfde opmaak, zodat je in een oogopslag '
   'ziet waar het druk is. Nieuwsberichten krijgen daarvoor een kop op een regel in plaats van twee.');
