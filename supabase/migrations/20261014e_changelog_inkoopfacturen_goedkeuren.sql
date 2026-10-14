-- Wat is nieuw: inkoopfacturen goedkeuren in EVA (live en voor het eerst gebruikt op 14-10-2026).
insert into public.changelog (datum, categorie, module, titel, omschrijving, doelgroep) values
  ('2026-10-14','nieuw','Inkoop','Inkoopfacturen goedkeuren in EVA',
   'Inkoopfacturen keur je nu in EVA goed in plaats van in Bouw7. Met de knop Goedkeuren komen jouw facturen één voor één voorbij: links de factuur, rechts de gegevens, onderaan Akkoord of Bezwaar. Na je akkoord staat de factuur in Bouw7 meteen op goedgekeurd, met jouw naam erbij. Bij een bezwaar krijgt de administratie een taak om de leverancier te benaderen.',
   'kantoor');
