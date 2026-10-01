-- Changelog: opdrachtbon zonder passende offerte was niet in te schrijven.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-10-01','opgelost','Mailintake','Opdrachtbon zonder offerte is weer in te schrijven',
   'Bij een opdrachtbon op een adres waar meerdere dossiers lopen dacht EVA soms dat de bon bij '
   || 'een bestaande offerte hoorde, alleen omdat het adres overeenkwam. Het scherm vroeg dan welke '
   || 'offerte gewonnen moest worden en de knop om een nieuw dossier aan te maken was weg. EVA '
   || 'gelooft nu alleen een offerte die werkelijk aanwijsbaar is — ons offertenummer in de mail, '
   || 'dezelfde mailconversatie of dezelfde bijlage. Past er niets, dan maak je gewoon een nieuw '
   || 'dossier aan, met de gevonden offertes nog wel binnen bereik.');
