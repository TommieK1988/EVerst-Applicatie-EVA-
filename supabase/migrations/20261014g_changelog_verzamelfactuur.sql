-- Wat is nieuw: verzamelfactuur voor servicedeskbonnen (live 14-10-2026).
insert into public.changelog (datum, categorie, module, titel, omschrijving, doelgroep) values
  ('2026-10-14','nieuw','Financieel','Verzamelfactuur voor servicedeskbonnen',
   'Op het Facturen-scherm staat nu de knop Nieuwe verzamelfactuur. Kies de werkmaatschappij en de factuurpartij, vink de bonnen op Kosten compleet aan en geef een omschrijving mee. Je ziet eerst een voorbeeld; daarna staat de factuur als concept klaar in Bouw7, met per bon een eigen kopje. Zodra de administratie hem verstuurt, gaan de bonnen vanzelf naar Financieel gereed.',
   'kantoor');
