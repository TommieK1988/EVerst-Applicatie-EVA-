-- Changelog: weekstaat aanpassen na indienen, tot er iets is goedgekeurd (uiterlijk maandag 12:00).
insert into public.changelog (datum, categorie, module, titel, omschrijving, doelgroep) values
  ('2026-10-14','verbeterd','Uren','Uren aanpassen na indienen',
   'Heb je je week ingediend en zie je nog een fout? Je kunt je uren en kosten nog aanpassen tot je goedkeurder iets heeft goedgekeurd, en uiterlijk tot maandag 12:00.',
   'mobiel'),
  ('2026-10-14','verbeterd','Uren','Medewerkers kunnen ingediende uren nog corrigeren',
   'Een medewerker kan zijn ingediende week in de app nog aanpassen zolang de goedkeurder er niets van heeft goedgekeurd, en uiterlijk tot maandag 12:00. Wijzigingen staan meteen in Bouw7. Zodra jij als goedkeurder één regel goedkeurt, ligt de week vast.',
   'kantoor');
