-- Changelog: een type erbij op een relatie maakt het bedrijf in Bouw7 ook in die rol aan.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-10-08','verbeterd','Relaties','Opdrachtgever, leverancier én onderaannemer: één relatie, ook in Bouw7',
   'Is een opdrachtgever ook leverancier of onderaannemer, zet dan bij de relatie het type erbij. EVA maakt het bedrijf in Bouw7 dan ook in die rol aan, met dezelfde gegevens, en houdt die gegevens daarna gelijk. In EVA blijft het één relatie.');
