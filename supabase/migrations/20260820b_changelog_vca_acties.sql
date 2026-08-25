-- Changelog: VCA-overzicht toont de acties uit de actielijst.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-08-20','opgelost','KAM/VGM','VCA-overzicht toont nu wel de acties en formulieren',
   'In het KAM/VGM-dashboard en op het VCA-tabblad van een opdracht bleven de tellingen altijd op nul staan, ook als er een actielijst met VCA-taken hing. Ze kijken nu naar de acties uit de actielijst zelf. Je ziet per opdracht twee dingen naast elkaar: van hoeveel acties het formulier daadwerkelijk is ingediend, en hoeveel acties er zijn afgevinkt. Loopt dat uiteen, dan is een actie afgevinkt zonder dat het formulier is ingevuld. Op het tabblad staat elke VCA-actie erbij, met een link om het formulier alsnog in te vullen.');
