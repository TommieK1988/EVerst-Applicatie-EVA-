-- Changelog-item: de widget Goedkeuren opnieuw ingedeeld.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-09', 'verbeterd', 'Dashboard',
   'Goedkeuren-widget: facturen en uren als een regel, de rest op deadline',
   'Inkoopfacturen stonden stuk voor stuk in het kaartje Goedkeuren en duwden bij een drukke week '
   'de offertes en werkbegrotingen uit beeld. Ze staan nu op een regel bovenaan, met het aantal en '
   'het totaalbedrag; klikken brengt je naar het inkoopscherm op het tabblad Te accorderen door mij. '
   'Daaronder staan de uren, ook op een regel, en die brengt je nu naar al je goed te keuren uren in '
   'plaats van alleen die van deze maand -- op het Uren-scherm is daarvoor de periode Te keuren '
   'bijgekomen. Offertes en werkbegrotingen blijven per stuk staan, maar nu op volgorde van de '
   'deadline van het dossier, met die datum in beeld en rood zodra hij verstreken is. Staat er niets '
   'open in een van de stapels, dan verdwijnt die regel.');
