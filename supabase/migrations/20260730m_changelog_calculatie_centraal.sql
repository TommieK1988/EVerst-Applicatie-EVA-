-- Changelog: calculatiegegevens centraal + materialen toevoegen

insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-07-30','opgelost','Calculatie','Je calculatie-instellingen en meetstaten staan nu overal gelijk',
   'Eenheden, categorieën en meetstaten werden in je browser bewaard. Op een andere computer, of nadat je je browsergegevens had gewist, zag je daardoor de standaardlijst in plaats van je eigen lijst — en meetstaten van een collega zag je helemaal niet. Alles staat nu centraal in EVA, dus iedereen ziet hetzelfde. Wat nog op je eigen computer stond, wordt bij het eerstvolgende inloggen automatisch overgezet.'),
  ('2026-07-30','verbeterd','Calculatie','Materiaal toevoegen gaat via een invulvenster',
   'De knop maakte eerst een lege regel onderaan de lijst, die vaak niet te zien was tussen de duizenden materialen of achter een actief filter. Je vult nu eerst de gegevens in en de nieuwe regel verschijnt daarna bovenaan. Eenheid en kostprijs kun je voortaan ook in de lijst zelf aanpassen.');
