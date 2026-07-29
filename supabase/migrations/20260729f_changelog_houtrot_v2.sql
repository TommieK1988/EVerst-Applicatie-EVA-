-- Changelog: houtrot eenvoudiger registreren + desktop bewerken (livegang 2026-07-29).
-- Toegepast op productie via de Supabase MCP op het moment van livegang op main.

insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-07-29','verbeterd','Houtrot','Houtrot: eenvoudiger registreren en bewerken op de desktop',
   'Bij het registreren kies je de werkzaamheid nu in twee stappen (eerst de soort, dan de variant) en zet je de status met één tik op Geregistreerd (oranje) of Afgerond (groen). Op de desktop kun je een registratie openen en helemaal bijwerken, en het overzicht toont nu ook uren, arbeids- en materiaalkosten om de productie tegen de geboekte kosten te spiegelen.');
