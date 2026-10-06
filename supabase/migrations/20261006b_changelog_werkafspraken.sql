-- Changelog: werkafspraken en aanwijzingen voor de mailintake.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-10-06','nieuw','Mailintake','Vertel EVA zelf hoe hij de post moet lezen',
   'Rechts op het behandelscherm staat een vak waarin je in gewone taal kunt zeggen wat EVA moet '
   || 'weten — bijvoorbeeld dat de opdrachtgever de VvE is en niet de beheerder. Kies "Alleen deze '
   || 'mail" en hij leest dit bericht meteen opnieuw met jouw aanwijzing erbij; kies "Altijd zo '
   || 'doen" en hij onthoudt het voor alle volgende post. EVA zegt er terug wat hij ervan begrijpt, '
   || 'zodat je meteen ziet of het goed landt — en als hij iets niet kan, zegt hij dat ook. Wat hij '
   || 'onthouden heeft staat bij Instellingen · Mailintake, waar je afspraken kunt uitzetten.');
