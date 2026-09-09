-- Changelog-item: vastgelopen offerte-goedkeuringen opgeruimd.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-09', 'opgelost', 'Offertes',
   'Offertes die al goedgekeurd waren, bleven in Goedkeuren staan',
   'Maakte je een offerte opnieuw aan vanuit de calculatie, dan bleef het goedkeurverzoek van de '
   'oude versie openstaan. In het kaartje Goedkeuren zag je daardoor een offerte die je nog moest '
   'beoordelen terwijl die allang goedgekeurd en verzonden was, en klikte je erop dan kreeg je een '
   'foutpagina. Zo''n verzoek vervalt nu vanzelf zodra de offerte verdwijnt, en de openstaande '
   'verzoeken van eerder zijn opgeruimd. Klikken op een offerte brengt je voortaan naar het '
   'Calculatie-tabblad van het dossier, waar de offerte met de goedkeurknop opent.');
