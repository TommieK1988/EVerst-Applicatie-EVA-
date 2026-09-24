-- Changelog: het uren-verplaatsen-item noemt nu ook het urenoverzicht en mobiel keuren.
update public.changelog
set omschrijving = 'Geboekte uren kun je nu naar elke bewakingscode van het project verplaatsen, ook naar meerwerkcodes die alleen voor materiaal of onderaanneming zijn begroot. Dat werkt op de Uren-tab van het dossier, bij uren bewerken in het urenoverzicht en bij het keuren op je telefoon. Voorheen stonden die codes niet in de keuzelijst. EVA zet de code daarbij zelf klaar in Bouw7.'
where titel = 'Uren verplaatsen naar elke bewakingscode, ook meerwerk' and datum = '2026-09-24';
