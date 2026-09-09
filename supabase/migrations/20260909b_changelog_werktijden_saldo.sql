-- Changelog-item: aanwezigheid tegenover geboekte arbeidsuren op de werktijdenlijst.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-09','nieuw','Wagenpark','Werktijden: aanwezig tegenover geschreven uren',
   'De werktijdenlijst van een medewerker laat nu ook zien hoe lang hij die dag op het werk was — '
   || 'van de aankomst tot het vertrek naar huis, met de pauzes eraf — en zet dat naast de uren die hij '
   || 'die dag geschreven heeft. Alleen echte werkuren tellen mee: vakantie, ziek, feestdag en verlof niet. '
   || 'Het verschil staat als saldo in de lijst, per medewerker opgeteld en in de uitdraai. '
   || 'Dagen waarop de auto niets bruikbaars laat zien krijgen een streepje in plaats van een nul.');
