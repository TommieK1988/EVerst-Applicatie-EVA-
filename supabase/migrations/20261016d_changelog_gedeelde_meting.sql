-- Wat is nieuw: één meting in meerdere regels (live op 16-10-2026).
insert into public.changelog (datum, categorie, module, titel, omschrijving, doelgroep) values
  ('2026-10-16','nieuw','Calculatie','Eén meting voor meerdere posten',
   'Meet je de voorgevel in bij gevelreiniging, dan kies je dezelfde meting bij voegwerk en steiger: dubbelklik op de hoeveelheid en kies hem bovenaan onder "Gemeten in deze calculatie". Per post kies je bruto of netto. Pas je de meting later aan, dan gaan alle gekoppelde posten mee; typ je bij één post zelf een getal, dan laat die post de koppeling los. Geef de meting een eigen naam, zoals "Gevelvlak voorgevel", zodat je hem terugvindt.',
   'kantoor');
