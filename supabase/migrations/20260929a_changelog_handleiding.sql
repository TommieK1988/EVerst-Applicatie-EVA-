-- Changelog: de mobiele handleiding en het duidelijker inloggen.
-- Beide staan sinds 28 september op main (commit a4ba2a74) en zijn dus live.

insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-28','nieuw','Mobiel','Handleiding voor EVA op je telefoon',
   'Nieuwe collega''s krijgen de handleiding voortaan als bijlage bij hun uitnodiging. Daarin staat stap voor stap hoe je inlogt, hoe je EVA op je beginscherm zet en wat je per onderdeel kunt doen: acties, dossiers, uren, planning, verlof, materieel en het handboek. Kwijtgeraakt? Je vindt hem terug onder Mijn gegevens.'),

  ('2026-09-28','verbeterd','Mobiel','Duidelijker inloggen met je werkaccount',
   'Heb je een e-mailadres van Everts, dan log je altijd in met de knop Inloggen met Microsoft. Probeer je toch een wachtwoord in te stellen, dan legt EVA nu meteen uit hoe het wel moet, in plaats van te melden dat je gegevens onjuist zijn. Dat voorkomt dat er twee accounts op je naam ontstaan, want daarmee kwam je met geen van beide nog binnen.');
