-- Changelog: opslag% en BTW wijzigen voor meerdere calculatieregels tegelijk
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-02','verbeterd','Calculatie','Opslag% en BTW voor meerdere regels tegelijk wijzigen',
   'Selecteer je regels in de calculatie, dan kun je ze naast kopiëren en verplaatsen nu ook in één keer op een ander opslagpercentage of BTW-tarief zetten. Het opslagvenster staat al voorgevuld als alle geselecteerde regels hetzelfde percentage hebben, en met één knop zet je ze terug op de standaard-opslag van de calculatie. Vergist? Ctrl+Z draait de hele wijziging in één keer terug.');
