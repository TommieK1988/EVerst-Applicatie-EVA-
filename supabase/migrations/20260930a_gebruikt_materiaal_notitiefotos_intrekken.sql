-- Drie kleine uitbreidingen, allemaal additief (bestaande code blijft werken):
--
-- 1. dossier_pakbonnen → "Gebruikt materiaal". De monteur kan naast een pakbonfoto ook getypt
--    materiaal vastleggen. Dat is een rij zonder foto, met de tekst in `opmerking`. Eén van
--    beide moet er zijn: een lege rij zegt niets.
--
-- 2. dossier_notities.foto_urls: een "opmerking voor kantoor" vanaf de telefoon kan foto's
--    meekrijgen. Publieke URL's in de bucket `servicedesk-fotos`, net als de pakbonnen.
--
-- 3. werkbegroting_bestellingen.ingetrokken_op/_door: intrekken zet de bestelling terug op
--    concept en wist de verstuurd-velden. Zonder deze twee is daarna niet meer te zien dat een
--    opdracht al eens bij de partij lag en is ingetrokken.

alter table public.dossier_pakbonnen alter column foto_url drop not null;

alter table public.dossier_pakbonnen drop constraint if exists dossier_pakbonnen_foto_of_tekst;
alter table public.dossier_pakbonnen add constraint dossier_pakbonnen_foto_of_tekst
  check (foto_url is not null or length(btrim(coalesce(opmerking, ''))) > 0);

comment on table public.dossier_pakbonnen is
  'Gebruikt materiaal op een servicedeskbon vanaf mobiel: een pakbonfoto (foto_url) of getypt materiaal (alleen opmerking).';

alter table public.dossier_notities
  add column if not exists foto_urls text[] not null default '{}';

alter table public.werkbegroting_bestellingen
  add column if not exists ingetrokken_op   timestamptz,
  add column if not exists ingetrokken_door uuid references public.medewerkers(id) on delete set null;
