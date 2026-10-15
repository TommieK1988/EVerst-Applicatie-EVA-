-- Wat is nieuw: activiteit en fase groeien mee met hun planitems.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-10-15','opgelost','Planning','Activiteit en fase groeien mee met hun planitems',
   'Een planitem kon buiten de balk van zijn activiteit en fase staan, bijvoorbeeld na verplaatsen in de Medewerkerplanning. Nu groeit de activiteit, en daarmee de fase, vanzelf mee als je een planitem erbuiten zet. Slepen buiten de activiteit wordt ook niet meer geweigerd. Bestaande planningen zijn rechtgetrokken.');
