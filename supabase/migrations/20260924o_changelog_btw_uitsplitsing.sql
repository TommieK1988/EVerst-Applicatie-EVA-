-- Changelog: BTW-uitsplitsing toont hetzelfde tarief niet meer twee keer.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-24','opgelost','Offertes','Hetzelfde BTW-tarief niet meer twee keer op de offerte',
   'Soms stond 21% twee keer in de BTW-uitsplitsing van een offerte of calculatie, omdat een deel van de regels geen gekoppeld tarief had. Die regels tellen nu mee bij het gewone tarief met hetzelfde percentage, zodat elk tarief één keer wordt getoond. De bedragen zelf waren en blijven gelijk.');
