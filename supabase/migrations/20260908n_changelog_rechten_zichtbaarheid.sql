-- Changelog-item: rechten en gebruikerstoegang zijn voortaan alleen voor beheerders zichtbaar.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-08','verbeterd','Medewerkers','Rechten alleen nog zichtbaar voor beheerders',
   'Op de medewerkerkaart en in Instellingen was voor iedere collega te zien welk toegangstype en welke rechten anderen hadden. Aanpassen kon al alleen door een beheerder, maar meekijken nu ook. Je eigen Office 365-koppeling blijft gewoon op je eigen kaart staan.');
