-- Factuuradressen koppelen aan het Bouw7-contact waar ze vandaan komen.
--
-- Tot nu toe was `relatie_factuuradressen` een puur handmatige tabel: gevuld via de relatiepagina,
-- via mailintake, en eenmalig door de opruimscripts van september 2026. Die scripts noteerden het
-- Bouw7-contact waar het adres bij hoort in de vrije tekst van `opmerkingen` ("Bouw7-contact 4062052",
-- "(Bouw7 3941707)", "Als Klant aangemaakt in Bouw7: contact 4065221"). Prima als geheugensteun,
-- onbruikbaar als sleutel.
--
-- De dossiersync gaat het Bouw7-maatwerkveld "Factuuradres" (`caFactuuradres`) lezen en daaruit zelf
-- adresrijen aanmaken. Zonder een echte sleutel zou elke run een duplicaat maken, dus die komt hier:
-- `bouw7_contact_id`, met een unieke index per relatie.
--
-- De backfill leest de drie tekstpatronen. Dat is geen gok: voor 60 van de 62 bestaande rijen levert
-- een onafhankelijke match van `label` op `relaties.naam` (genormaliseerd) exact hetzelfde contact-id
-- op — nul afwijkingen. De twee rijen die zo'n naam-match niet oplost, lost de tekst wél op:
--   * "VvE 7069 - Seghwaert SE-a" bestaat twee keer als relatie (4065221 en 4041252);
--   * "9026 VvE Von Geusaustraat …" heeft helemaal geen contact en blijft dus leeg — terecht, want
--     daar ligt de tenaamstelling vast en mag niets automatisch aan gekoppeld worden.

alter table public.relatie_factuuradressen
  add column if not exists bouw7_contact_id text;

comment on column public.relatie_factuuradressen.bouw7_contact_id is
  'Bouw7-contact waar dit factuuradres voor staat. Sleutel voor de sync op het maatwerkveld Factuuradres; leeg = puur EVA-eigen adres, dat de sync met rust laat.';

update public.relatie_factuuradressen
set bouw7_contact_id = coalesce(
      (regexp_match(opmerkingen, 'Bouw7-contact ([0-9]+)'))[1],
      (regexp_match(opmerkingen, '\(Bouw7 ([0-9]+)\)'))[1],
      -- "contact 4065221", maar niet de "contactpersoon 451646" waar dezelfde zin mee begint.
      (regexp_match(opmerkingen, '(?<!persoon)\mcontact ([0-9]+)'))[1]
    )
where bouw7_contact_id is null
  and opmerkingen is not null;

-- Eén adresrij per (relatie, Bouw7-contact): hierop draait de upsert van de sync.
--
-- Bewust géén partiële index (`where bouw7_contact_id is not null`), hoe logisch die hier ook
-- oogt: PostgREST stuurt een kale `on conflict (relatie_id, bouw7_contact_id)` zonder predicaat
-- mee, en Postgres kan een partiële index daar niet uit afleiden — de upsert zou afketsen op
-- "no unique or exclusion constraint matching the ON CONFLICT specification". Nodig is de index
-- ook niet: NULLs gelden als onderling verschillend, dus een relatie mag nog steeds zoveel
-- handmatige adressen zonder Bouw7-contact hebben als nodig.
create unique index if not exists relatie_factuuradressen_bouw7_contact_uniek
  on public.relatie_factuuradressen (relatie_id, bouw7_contact_id);
