-- Changelog: conflict oplossen via klikbare gloed in de medewerkerplanning
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-07-20','nieuw','Planning','Dubbele planning direct oplossen',
   'Staat iemand dubbel ingepland, dan kun je nu op het rood oplichtende stukje in de medewerkerplanning klikken. Je krijgt een venster met kant-en-klare voorstellen (bijvoorbeeld het tweede klusje direct ná het eerste plannen, of naar de eerstvolgende vrije dag) en een voorbeeld dat meteen laat zien of de overlap weg is. Ook werk dat tijdens verlof of een feestdag staat, verplaats je zo in één klik naar een werkbare dag.');
