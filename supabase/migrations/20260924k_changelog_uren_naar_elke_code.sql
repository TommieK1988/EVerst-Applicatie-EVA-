-- Changelog: uren verplaatsen naar elke bewakingscode, ook meerwerkcodes.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-24','verbeterd','Dossiers','Uren verplaatsen naar elke bewakingscode, ook meerwerk',
   'Bij Uren kun je geboekte uren nu naar elke bewakingscode van het project verplaatsen, ook naar meerwerkcodes die alleen voor materiaal of onderaanneming zijn begroot. Voorheen stonden die codes niet in de keuzelijst. EVA zet de code daarbij zelf klaar in Bouw7.');
