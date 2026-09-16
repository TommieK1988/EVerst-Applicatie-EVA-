-- Changelog-item bij de koppeling tussen de actielijst en de offertebewaking.
-- Toegepast ná de merge naar main (zie CLAUDE.md: elk gepubliceerd item is direct
-- voor iedereen zichtbaar, ongeacht op welke branch de code staat).

insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-16','verbeterd','Offertes','Je nabelacties staan al in de offertebewaking',
   'Staat er op een offertedossier al een openstaande actie met een deadline, dan gebruikt EVA die meteen als volgende stap: de taaktitel als omschrijving, de deadline als datum en de toegewezen collega als actiehouder. Je hoeft dus niets over te typen om te beginnen. Op de kaart staat er "uit de actielijst" achter, zodat je ziet dat het overgenomen is en nog geen commerciële afspraak. Leg je een uitkomst vast, dan wordt die actie meteen afgevinkt; vink je hem in de actielijst af, dan schuift de kaart door naar de eerstvolgende actie.');
