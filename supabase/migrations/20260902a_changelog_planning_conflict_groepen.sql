-- Changelog: conflictdriehoek alleen voor lopende conflicten + groepsbalken in de medewerkerplanning.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-02','verbeterd','Planning','Conflictwaarschuwing alleen nog voor werk dat nog komt',
   'Het rode waarschuwingsdriehoekje bij een medewerker verscheen ook bij dubbele planningen van weken geleden, terwijl daar niets meer aan te doen valt. Het staat er nu alleen nog bij conflicten van vandaag of later. De rode gloed op de balken zelf blijft gewoon staan, ook bij oudere conflicten, dus je kunt de historie nog steeds terugzien en aanklikken.'),
  ('2026-09-02','verbeterd','Planning','Tussenbalk met de groepsnaam bij sorteren',
   'Sorteer je de medewerkerplanning op ploeg, afdeling of functie, dan staat er nu boven elke groep een balk met de naam erin. Die loopt door over de hele tijdlijn, zodat je in één oogopslag ziet waar de ene ploeg ophoudt en de volgende begint. Medewerkers zonder ploeg, afdeling of functie staan onderaan bij elkaar.');
