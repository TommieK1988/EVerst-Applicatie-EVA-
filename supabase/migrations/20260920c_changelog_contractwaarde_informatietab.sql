-- Wat is nieuw: Informatie-tab en Verkoop-tab tonen dezelfde contractwaarde.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-20','opgelost','Dossiers','Financiële totalen komen overeen met het Verkoop-tab',
   'Het blok Financiële totalen op de Informatie-tab rekende regiewerk anders op dan het Verkoop-tab, waardoor dezelfde opdracht op twee schermen een ander contracttotaal kon tonen. Beide gebruiken nu dezelfde berekening. Staat er een stelpost buiten de aanneemsom waarop geboekt is, dan komt er onder het begrote bedrag een regel met het verschil ten opzichte van de nacalculatie — zo zie je wat er begroot was én waar de post werkelijk op uitkomt.');
