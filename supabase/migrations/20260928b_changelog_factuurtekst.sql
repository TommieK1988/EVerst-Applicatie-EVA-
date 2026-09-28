-- Changelog: eigen factuurtekst bij het klaarzetten van een regiefactuur.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-28','verbeterd','Facturatie','Eigen factuurtekst op een regiefactuur',
   'In het venster Factuurregels staat nu een veld Factuurtekst. Wat je daar typt, bijvoorbeeld een beheercode en budgetcode of een korte beschrijving van het uitgevoerde werk, komt bij Klaarzetten in Bouw7 als tekst op de factuur. Elke regel wordt een eigen alinea, net als wanneer je de tekst in Bouw7 zelf typt. Laat je het veld leeg, dan blijft de standaardtekst staan.');
