-- Changelog-item: parkeerkosten per project zichtbaar.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-09', 'nieuw', 'Wagenpark',
   'Parkeerkosten zichtbaar per project',
   'Parkeerkosten verdwenen tot nu toe in de algemene kosten, terwijl ze bij een project horen: '
   'je parkeert nu eenmaal bij het werkadres waar je die dag staat. EVA zoekt er voortaan zelf het '
   'juiste project bij, op basis van de rit, de planning en de afstand tot het werkadres. Op het '
   'Financieel-tab van een dossier zie je bovenaan welke parkeerkosten erbij horen. Twijfelgevallen '
   'komen in een werklijst onder Wagenpark > Parkeren > Toewijzen, waar je per regel ziet waarop het '
   'voorstel berust en het met een klik bevestigt of naar een ander project verplaatst. De bedragen '
   'zijn informatie: ze worden niet geboekt en komen niet vanzelf op een factuur.');
