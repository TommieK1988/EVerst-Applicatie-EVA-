-- Changelog: de twee inkooptabellen zijn er één geworden.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-23','verbeterd','Dossiers','Inkooporders en onderaanneming in één tabel',
   'Op het tabblad Inkoop stonden twee tabellen onder elkaar met dezelfde kolommen onder andere namen. Dat is nu één tabel die op een halve pagina past: het nummer en de omschrijving staan onder de naam van de partij, en de drie bedragen blijven naast elkaar in beeld. Staat er van beide soorten iets, dan zie je onderaan nog steeds een subtotaal per soort naast het totaal.');
