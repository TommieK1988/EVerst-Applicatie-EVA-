-- Wat is nieuw: ingediende kosten goedkeuren door de projectleider (live op 16-10-2026).
-- Twee items: kantoor (de projectleider en de administratie) en mobiel (de vakman).
insert into public.changelog (datum, categorie, module, titel, omschrijving, doelgroep) values
  ('2026-10-16','nieuw','Uren','Projectleider keurt ingediende kosten goed',
   'Parkeer-, reis- en overige kosten worden nu per post goedgekeurd door de projectleider van het project waarvoor ze gemaakt zijn; kosten zonder project gaan naar de eigen goedkeurder van de medewerker. Je vindt ze bovenaan het Uren-overzicht en in de widget Goedkeuren. Afkeuren vraagt een reden, die de medewerker te zien krijgt. Wie uitbetaalt ziet in de kostentabel per post of hij is goedgekeurd.',
   'kantoor'),
  ('2026-10-16','nieuw','Uren','Kosten per project, met goedkeuring',
   'Bij Kosten toevoegen kies je nu het project waarvoor je de kosten maakte. Werkte je die dag op één project, dan staat dat al klaar. In je weekstaat zie je per kostenpost of hij is goedgekeurd, of waarom hij is afgekeurd.',
   'mobiel');
