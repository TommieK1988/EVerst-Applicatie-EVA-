-- Wat is nieuw: standaardopslag voor nieuwe calculaties, eigen opslag per regel blijft staan (live op 16-10-2026).
insert into public.changelog (datum, categorie, module, titel, omschrijving, doelgroep) values
  ('2026-10-16','verbeterd','Calculatie','Standaardopslag en eigen opslag per regel',
   'Een nieuwe calculatie begint nu met de standaardopslag uit de calculatie-instellingen (25% als er niets is ingevuld). Wijzig je de opslag onderin en hebben regels een eigen opslag, dan kies je of alleen de gewone regels meegaan of alle regels.',
   'kantoor');
