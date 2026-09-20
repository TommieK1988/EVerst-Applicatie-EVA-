-- Wat is nieuw: regie en stelposten tellen mee in de contractwaarde op het Verkoop-tab.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-20','opgelost','Financieel','Regie en stelposten tellen mee in de opdrachtsom',
   'In het Overzicht op het Verkoop-tab telde regiewerk niet of niet goed mee in de contractwaarde. Een stelpost die niet in de aanneemsom zit stond zelfs helemaal nergens in het totaal, terwijl het bedrag een blok verderop wel bij de nacalculatie stond. De opdrachtsom is nu opgebouwd uit de aanneemsom, het aangenomen meerwerk en de nacalculatie, en dat laatste bedrag is precies wat je in het blok Nacalculatie ziet staan. Al gefactureerde posten tellen gewoon mee, want ze horen bij de waarde van de opdracht.');
