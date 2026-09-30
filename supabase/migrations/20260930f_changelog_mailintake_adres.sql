-- Changelog: mailintake schrijft meer bonnen zelf in.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-30','opgelost','Mailintake','Bonnen blijven niet meer liggen op een typefout in de postcode',
   'Stond er een verkeerde postcode in de mail, dan herkende EVA het adres niet en werd de bon '
   || 'ter beoordeling voorgelegd — ook als straat, huisnummer en plaats gewoon klopten. EVA zoekt '
   || 'nu op straat en plaats verder en zet de juiste postcode erbij. Ook servicedeskbonnen worden '
   || 'eerder vanzelf ingeschreven: die zijn vaak kort geschreven, en daar werd EVA onnodig '
   || 'voorzichtig van.');
