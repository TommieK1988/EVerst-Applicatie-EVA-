-- Changelog: Formulieren-overzicht gevuld + VCA-diploma's per opdracht.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-08-20','opgelost','Formulieren','Overzicht van actieve dossiers is niet langer leeg',
   'Het scherm Formulieren - actieve dossiers bleef altijd leeg, ook als er formulieren openstonden. Het toont nu alle formulier-acties van lopende dossiers, met status, deadline en aan wie ze zijn toegewezen. Klik je op een regel zonder ingevuld formulier, dan open je het formulier meteen op die actie en pak je een eerder begonnen concept weer op.'),
  ('2026-08-20','verbeterd','KAM/VGM','VCA-diploma''s van de mensen op de opdracht',
   'Het blok VCA-diploma''s op het VCA-tabblad toonde diplomabestanden van het hele bedrijf. Het laat nu de mensen zien die daadwerkelijk op die opdracht staan - ingepland of met een rol - met hun diploma uit het VCA-register en of dat geldig is, binnenkort verloopt, verlopen is of ontbreekt. Wie geen geldig diploma heeft, staat bovenaan.');
