-- Wat-is-nieuw: "Beide behouden" op het ontdubbelscherm.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-21','nieuw','Relaties','Twee rijen die geen dubbel zijn kun je nu wegzetten',
   'Op het tabblad Dubbelen staat bij elke groep de knop "Beide behouden". Lijken twee relaties '
   || 'of contactpersonen op elkaar maar zijn het echt twee verschillende, dan verdwijnt die groep '
   || 'voorgoed uit de lijst in plaats van dat hij elke keer terugkomt. Onderaan het scherm zie je '
   || 'wat er zo beoordeeld is, met een knop om het terug te draaien.');
