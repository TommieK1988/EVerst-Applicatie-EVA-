insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-30','opgelost','Dossiers','Geen foutmelding meer bij het openen van een dossier',
   'Bij het openen van een dossier verscheen soms kort een melding "Application error", waarna '
   || 'het dossier alsnog gewoon laadde. Dat is opgelost: het dossier opent nu direct, zonder '
   || 'die tussenstap.');
