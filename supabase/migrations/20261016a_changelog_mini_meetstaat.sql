-- Wat is nieuw: mini-meetstaat bewaart de meting, met bruto/netto (live op 16-10-2026).
insert into public.changelog (datum, categorie, module, titel, omschrijving, doelgroep) values
  ('2026-10-16','verbeterd','Calculatie','Mini-meetstaat onthoudt je maten',
   'Dubbelklik op een hoeveelheid, meet het in en de maten blijven nu bij de regel bewaard: een meetlintje in de cel laat zien dat er gemeten is, en met een nieuwe dubbelklik zie je de meting terug. Ramen en deuren zet je als aftrek, waarna je kiest of de regel bruto of netto meetelt, bijvoorbeeld netto voor gevelreiniging en bruto voor de steiger. Pas je de hoeveelheid later met de hand aan, dan waarschuwt EVA dat de meting niet meer klopt.',
   'kantoor');
