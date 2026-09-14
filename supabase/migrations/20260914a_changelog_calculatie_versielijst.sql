-- Toegepast op productie via de Supabase MCP op 2026-09-14.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-14','opgelost','Calculatie','Calculatie opent weer op de versielijst',
   'Zijn er meerdere calculaties of offertes in een dossier, dan opende het Calculatie-tabblad '
   || 'direct de eerste calculatie in plaats van het overzicht met de versies. Je ziet nu altijd '
   || 'eerst de lijst en kiest zelf welke versie je opent. Ook blijft een geopende offerte niet '
   || 'meer in beeld staan als je in de zijbalk opnieuw op Calculatie klikt.');
