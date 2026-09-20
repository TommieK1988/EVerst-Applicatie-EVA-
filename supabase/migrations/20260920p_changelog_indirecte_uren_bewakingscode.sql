-- Wat is nieuw: op een indirecte-urenproject is een bewakingscode niet meer nodig.

insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-20','opgelost','Uren','Indirecte uren zonder bewakingscode',
   'Uren op een indirecte-urenproject vroegen om een bewakingscode die er niet is — je kon ze niet opslaan, de week niet indienen en de fiatteerknop bleef grijs. Dat hoeft nu niet meer: op zulke projecten vraagt EVA geen code, en ze staan voortaan altijd in de projectlijst onder de kop Indirecte uren.');
