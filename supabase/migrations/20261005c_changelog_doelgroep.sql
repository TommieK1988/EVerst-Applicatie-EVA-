-- Changelog per doelgroep: kantoor (EVA op de computer), mobiel (EVA Mobiel) of beide.
--
-- Een timmerman heeft niets aan "nieuwe kolom in de werkbegroting", en kantoor niet aan
-- "foto uit je galerij in de Houtrot-tab". Bestaande items zijn allemaal voor kantoor
-- geschreven, vandaar die default.
--
-- EVA Mobiel houdt een eigen gezien-moment bij: wie op kantoor de updates leest, heeft
-- de mobiele melding (met de oproep de app opnieuw op te starten) nog niet gezien.

alter table public.changelog
  add column if not exists doelgroep text not null default 'kantoor'
    check (doelgroep in ('kantoor','mobiel','beide'));

alter table public.changelog_gezien
  add column if not exists gezien_mobiel_op timestamptz;
