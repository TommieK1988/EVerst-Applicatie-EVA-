-- Wat is nieuw: een nieuwe actie zonder toewijzing verdwijnt niet meer (PR #50, live op 15-10-2026).
insert into public.changelog (datum, categorie, module, titel, omschrijving, doelgroep) values
  ('2026-10-15','opgelost','Acties','Een nieuwe actie verdwijnt niet meer',
   'Maak je een actie aan vanuit Mijn acties op de startpagina, dan sta je zelf standaard aangevinkt. Vink je niemand aan en hangt de actie niet aan een dossier, dan komt hij bij jou te staan in plaats van nergens.',
   'kantoor');
