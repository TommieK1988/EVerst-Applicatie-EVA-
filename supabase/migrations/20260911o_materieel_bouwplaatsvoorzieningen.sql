-- Materieel — categorie 'Keet' heet voortaan 'Bouwplaatsvoorzieningen'
--
-- De categorie dekte in de praktijk meer dan alleen de keet zelf: ook toiletunits,
-- containers en andere voorzieningen die op de bouwplaats komen te staan. De naam
-- dekte die lading niet.
--
-- Een enum-waarde hernoemen is hier genoeg: alle bestaande materieelregels wijzen
-- naar dezelfde waarde en verhuizen dus vanzelf mee — een losse update per rij is
-- niet nodig en zou de kolom alleen maar tijdelijk ongeldig maken.
--
-- Het team-type 'keet' (materieel_team_type) blijft ongemoeid: dat is een andere
-- lijst — de plek waar materieel hangt, niet wat voor soort materieel het is.

alter type materieel_categorie rename value 'keet' to 'bouwplaatsvoorziening';
