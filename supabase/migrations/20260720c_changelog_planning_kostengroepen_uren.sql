-- Changelog: kostengroepen/bewakingscodes-tabel bovenin de detailplanning
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-07-20','verbeterd','Planning','Geplande uren afgezet tegen de prognose per bewakingscode',
   'Bovenin de detailplanning van een opdracht staat nu een compacte tabel per bewakingscode: de geprognotiseerde arbeidsuren naast de uren die je al hebt ingepland, met het restant erachter. Zo zie je in één oogopslag hoeveel ruimte er per kostengroep nog is en of je ergens overplant. De losse "geschat/gepland"-tekst per activiteit is vervallen omdat die informatie nu overzichtelijker bovenin staat.');
