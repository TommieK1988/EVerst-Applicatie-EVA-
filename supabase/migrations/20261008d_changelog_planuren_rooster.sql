insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-10-08','opgelost','Planning','Geplande uren volgen nu de periode en het werkrooster',
   'Verleng, versleep of kopieer je een planitem, of pas je de datums aan, dan rekent EVA de uren opnieuw uit: werkdagen volgens het rooster, de eerste en laatste dag naar de ingevulde tijden. Zo kloppen de geplande uren op het project weer. Een planitem dat al liep begint niet meer om 00:00 maar op de starttijd uit het rooster.');

insert into public.changelog (datum, categorie, module, titel, omschrijving, doelgroep) values
  ('2026-10-08','opgelost','Planning','Je planning toont per dag de juiste tijden',
   'Sta je meerdere dagen op een klus, dan zie je nu elke dag apart met de tijden van die dag. De eerste dag begint op je starttijd, de andere dagen op je gewone werktijd.',
   'mobiel');
