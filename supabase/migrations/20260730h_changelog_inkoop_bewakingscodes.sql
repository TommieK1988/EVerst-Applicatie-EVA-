-- Changelog-item: alle bewakingscodes van het project kiesbaar bij het corrigeren van geboekte kosten.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-07-30','opgelost','Dossiers','Geboekte kosten weer naar de juiste bewakingscode',
   'Op het tabblad Inkoop kon je een geboekte kost vaak niet naar een bewakingscode verplaatsen: de keuzelijst bleef leeg of toonde maar een deel van de codes. EVA keek namelijk alleen naar codes die al ergens op het project gebruikt werden, terwijl je juist een code nodig hebt die nog nergens op staat. De lijst toont nu alle bewakingscodes van het project — dezelfde die je op het tabblad Financieel ziet — met hun omschrijving erbij.');
