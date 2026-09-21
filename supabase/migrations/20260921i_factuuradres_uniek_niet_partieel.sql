-- Correctie op 20260921h: de unieke index mag niet partieel zijn.
--
-- `where bouw7_contact_id is not null` leek netjes, maar PostgREST stuurt bij een upsert een kale
-- `on conflict (relatie_id, bouw7_contact_id)` zonder predicaat mee. Postgres kan daar geen
-- partiële index uit afleiden en geeft dan "no unique or exclusion constraint matching the
-- ON CONFLICT specification" — de sync zou op elke run afketsen.
--
-- Non-partieel kan gewoon: NULLs gelden in een unieke index als onderling verschillend, dus een
-- relatie houdt onbeperkt ruimte voor handmatige adressen zonder Bouw7-contact.

drop index if exists public.relatie_factuuradressen_bouw7_contact_uniek;

create unique index if not exists relatie_factuuradressen_bouw7_contact_uniek
  on public.relatie_factuuradressen (relatie_id, bouw7_contact_id);
