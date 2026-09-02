-- Changelog: regeltotaal telt de hoeveelheid van de detailregel weer mee
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-02','opgelost','Calculatie','Regeltotaal telt de hoeveelheid van de detailregel weer mee',
   'Stond er onder een begrotingsregel een detailregel voor materiaal of onderaanneming met een andere hoeveelheid dan 1, dan liet het totaal van die regel een te laag bedrag zien; het groepstotaal klopte wel. Ook werd die hoeveelheid stilzwijgend teruggezet naar 1 zodra je de prijs op de ingeklapte regel aanpaste. Beide zijn verholpen. De detailregel toont voortaan het bedrag per 1 hoeveelheid van de begrotingsregel — vermenigvuldigen met het aantal gebeurt in de begrotingsregel zelf.');
