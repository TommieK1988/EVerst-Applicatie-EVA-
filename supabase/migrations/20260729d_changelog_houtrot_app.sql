-- Changelog: houtrot in de app vereenvoudigd (livegang 2026-07-29).
-- Toegepast op productie via de Supabase MCP op het moment van livegang op main.

insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-07-29','verbeterd','Houtrot','Houtrot in de app: eenvoudiger registreren',
   'De houtrotregistratie op de telefoon is vereenvoudigd. De projectleider stelt per dossier in uit welke locatieniveaus de vakman kiest (bijvoorbeeld gevelzijde, etage, huisnummer). In de app kies je de locatie, voeg je werkzaamheden toe en maak je een voor- en na-foto — bedragen zijn er niet meer zichtbaar. Een registratie kun je opnieuw openen om te bewerken, en de status springt automatisch op Afgerond zodra er een na-foto is (handmatig aanpassen kan ook).');
