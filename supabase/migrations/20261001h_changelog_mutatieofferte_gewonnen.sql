-- Changelog: offerte gewonnen op een servicedeskbon neemt het bedrag en de termijnen over.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-10-01','opgelost','Servicedesk','Offerte gewonnen neemt de aanneemsom en termijnen over',
   'Zette je een offerte op een mutatie- of servicedeskbon op Gewonnen, dan bleef de aanneemsom in '
   || 'het dossier leeg en werden er geen termijnen aangemaakt. Nu wordt het offertebedrag de '
   || 'aanneemsom, ook in Bouw7, en komen de termijnen erin volgens de betalingsconditie van de '
   || 'offerte. Lukt dat laatste niet, bijvoorbeeld omdat er geen betalingsconditie op de offerte '
   || 'staat, dan zie je meteen waarom en stel je ze in op het tabblad Financieel.');
