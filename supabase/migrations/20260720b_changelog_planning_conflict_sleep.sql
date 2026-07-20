-- Changelog bijwerken: conflict oplossen gebeurt nu door de balken te slepen
-- (de eerdere "kant-en-klare voorstellen" zijn vervangen door een sleepbare tijdlijn).
update public.changelog
set omschrijving = 'Staat iemand dubbel ingepland, dan kun je nu op het rood oplichtende stukje in de medewerkerplanning klikken. Bovenin het venster zie je de betrokken planningen als balken die je met de muis kunt verschuiven tot de overlap weg is — een groen vinkje laat meteen zien wanneer het klopt. Wil je liever exacte tijden? Dat kan nog steeds via de datum- en tijdvelden eronder.'
where titel = 'Dubbele planning direct oplossen'
  and categorie = 'nieuw'
  and module = 'Planning';
