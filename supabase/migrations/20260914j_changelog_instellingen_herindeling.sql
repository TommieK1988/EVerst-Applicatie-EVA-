-- Changelog-item: het instellingenscherm opnieuw ingedeeld en verwante schermen samengevoegd.
-- Toegepast op productie via de Supabase MCP op 2026-09-14.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-14','verbeterd','Instellingen','Instellingen opnieuw ingedeeld en beter vindbaar',
   'De instellingen staan nu in dezelfde volgorde en onder dezelfde kopjes als het menu links, '
   || 'en bij elkaar horende schermen zijn samengevoegd. Zo staan de opmaak van de offerte, de '
   || 'algemene voorwaarden, de betalingscondities en de goedkeuringsdrempel voortaan onder één '
   || 'kopje Offertes, met tabbladen. Hetzelfde geldt voor Dossiers, Uren, Medewerkers en '
   || 'Facturatie. Bovenaan staat een zoekveld: typ bijvoorbeeld "logo", "btw" of "wachtwoord" en '
   || 'je springt meteen naar het juiste scherm. Ook kun je vanaf elke instellingenpagina met één '
   || 'klik terug naar het overzicht. Oude bladwijzers blijven gewoon werken.');
