insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-07','nieuw','Financieel','Facturen klaarzetten in Bouw7',
   'Op het Verkoop-tabblad van een opdracht vink je aan welke termijnen gefactureerd mogen worden; EVA zet die samen als conceptfactuur in Bouw7 klaar. De administratie hoeft hem daar alleen nog te controleren en te versturen. Het factuurnummer wordt zoals altijd pas bij het versturen toegekend.'),
  ('2026-09-07','nieuw','Financieel','Termijnschema uit de offerte aanmaken',
   'Staat er in Bouw7 nog geen termijnstaat, dan maak je die met een knop aan op basis van de betalingsconditie uit de offerte. De bedragen worden op de aanneemsom omgerekend. Wijkt het schema in Bouw7 af van wat er in de offerte staat, dan krijg je daar een melding over.'),
  ('2026-09-07','nieuw','Financieel','Regiewerk en stelposten voorbereiden voor de factuur',
   'Werk dat op nacalculatie afrekent - regie-meerwerk en stelposten - staat nu per bewakingscode klaar als factuurregel, met de geboekte kosten en de verkoopwaarde ernaast. Per post pas je de omschrijving, de opslag, het bedrag en de btw aan, en je kunt arbeid en materiaal als aparte regels tonen. Werk dat in de aanneemsom zit blijft er bewust buiten: dat is via de termijnen al gefactureerd.');
