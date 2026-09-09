-- Changelog-item: werktijdenlijst toont alle werkdagen, per dag, met tijd voor tijd.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-09','verbeterd','Wagenpark','Werktijden: alle werkdagen op één lijst',
   'De werktijdenlijst laat nu elke werkdag zien in plaats van alleen de dagen met een afwijking, '
   || 'en elke dag staat er nog maar één keer op — te laat en te vroeg naast elkaar in hun eigen kolom. '
   || 'Een dag die je als verklaard afvinkt telt niet meer mee in het saldo. '
   || 'In het zijpaneel kun je een rit meteen op zakelijk of privé zetten, waarna de dag opnieuw wordt uitgerekend, '
   || 'en kun je het saldo van een dag vastleggen als tijd voor tijd. Dat laatste verandert niets aan de geboekte uren: '
   || 'het legt alleen vast dat het verschil bekend is en verrekend wordt.');
