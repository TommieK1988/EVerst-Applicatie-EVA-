-- Changelog: einddatum arbeidscontract op de medewerkerkaart.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-23','nieuw','Medewerkers','Einddatum van het arbeidscontract vastleggen',
   'Op de medewerkerkaart staat nu het veld "Einde huidig contract", naast de datum in dienst. Loopt een contract binnen twee maanden af, dan zie je achter de datum hoeveel dagen er nog over zijn; een verlopen contract wordt rood gemarkeerd. In het medewerkersoverzicht kun je de kolom "Einde contract" aanzetten om alle einddatums op een rij te zien. Leeg laten betekent onbepaalde tijd.');
