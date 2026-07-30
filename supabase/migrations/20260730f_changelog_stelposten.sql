-- Changelog-item: stelposten aanwijzen binnen een aanneemsom en apart bewaken.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-07-30','nieuw','Financieel','Stelposten aanwijzen binnen de aanneemsom',
   'Bij Financiële totalen op een opdracht kun je nu zelf een deel van de aanneemsom aanwijzen als stelpost, ook als het project uit Bouw7 komt en er geen calculatie in EVA staat. Je geeft per stelpost aan of hij in de aanneemsom zit of apart wordt gefactureerd, en EVA maakt er een eigen bewakingscode voor aan zodat je de kosten los kunt volgen. Rekent een stelpost af op de geboekte kosten, dan zie je het verschil met het afgesproken bedrag en zet één klik dat verschil klaar als meer- of minderwerk — dat gaat zoals altijd eerst langs de klant.');
