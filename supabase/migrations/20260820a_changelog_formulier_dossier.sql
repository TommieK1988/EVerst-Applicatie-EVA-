-- Changelog: ingevuld formulier vanuit een actie hangt nu aan het juiste dossier.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-08-20','opgelost','KAM/VGM','Ingevuld formulier komt nu bij de juiste opdracht terecht',
   'Vulde je vanaf de computer een formulier in via een actie uit een actielijst, dan werd het formulier niet aan de opdracht gekoppeld. Het verscheen daardoor niet in het KAM/VGM-overzicht en niet op het VCA-tabblad van de opdracht. Dat is opgelost: de koppeling gaat nu automatisch goed, ongeacht of je op de computer of op je telefoon invult.');
