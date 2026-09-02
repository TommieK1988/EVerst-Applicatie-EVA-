-- Derde scope voor het klantportaal: 'alleen_gekoppeld'.
-- Toegepast op 2026-09-02 via de Supabase MCP.
--
-- Aanleiding: de voorzitter van een VvE, of een adviseur die de opdrachtgever
-- heeft ingehuurd om mee te kijken met de uitvoering. Zij horen bij één project
-- en verder nergens bij.
--
-- Met 'eigen_dossiers' zou zo iemand ook elk ánder dossier zien waar hij
-- toevallig als contactpersoon op staat — vandaag misschien geen, volgend jaar
-- wel, zonder dat iemand daar een besluit over neemt. 'alleen_gekoppeld' negeert
-- die regel volledig: alleen wat in portaal_gebruiker_dossiers staat telt.
-- Toegang uitbreiden is daarmee altijd een expliciete handeling.
alter table public.portaal_gebruikers
  drop constraint if exists portaal_gebruikers_scope_check;

alter table public.portaal_gebruikers
  add constraint portaal_gebruikers_scope_check
  check (scope in ('eigen_dossiers', 'organisatie', 'alleen_gekoppeld'));

comment on column public.portaal_gebruikers.scope is
  'eigen_dossiers = dossiers waar deze contactpersoon aan hangt; organisatie = alle dossiers van relatie_id; '
  'alleen_gekoppeld = uitsluitend de dossiers in portaal_gebruiker_dossiers (meekijkers van buiten). '
  'Losse koppelingen tellen bij alle drie mee.';

-- Waarom een meekijker is toegevoegd — "VvE-voorzitter", "toezichthouder namens
-- de opdrachtgever". Staat op de koppeling en niet op de persoon: dezelfde
-- adviseur kan bij het ene project meekijken namens de klant en bij het andere
-- niet betrokken zijn.
alter table public.portaal_gebruiker_dossiers
  add column if not exists rol text;

comment on column public.portaal_gebruiker_dossiers.rol is
  'Vrije omschrijving van waarom deze persoon meekijkt bij dit dossier. Alleen intern zichtbaar.';
