-- =====================================================================
-- Dossiers — werkadres-coördinaten voor "dossier openen op locatie"
-- =====================================================================
-- De buitendienst opent op de mobiele app automatisch het dossier dat bij
-- hun GPS-positie hoort. Daarvoor moeten de werkadressen van dossiers als
-- coördinaten beschikbaar zijn; die staan vandaag alleen als vrije tekst
-- (werkadres_straat/_huisnummer/_postcode/_stad). We voegen lat/lng toe en
-- laten de bestaande Nominatim-geocoder (wagenpark-module, incl.
-- public.geocode_cache) de tekst omzetten.
--
-- Additieve migratie — geen bestaande kolommen gewijzigd of verwijderd.
-- Zelfde kolom-patroon als medewerkers/bedrijfsgegevens
-- (20260720_wagenpark_werktijd_geo.sql).
-- =====================================================================

alter table public.dossiers
  add column if not exists adres_lat      double precision,
  add column if not exists adres_lng      double precision,
  add column if not exists geocode_status text,
  add column if not exists geocode_op     timestamptz;

-- De geocode-batch pakt dossiers die nog niet geprobeerd zijn
-- (geocode_status is null). Partiële index houdt die "te doen"-lijst goedkoop.
create index if not exists dossiers_geocode_todo_idx
  on public.dossiers (updated_at)
  where geocode_status is null;

-- ---------------------------------------------------------------------
-- Werkadres gewijzigd? Coördinaten ongeldig → nullen zodat de batch ze
-- opnieuw geocodet. `is distinct from` behandelt null-overgangen correct.
-- ---------------------------------------------------------------------
create or replace function public.dossiers_geocode_reset() returns trigger as $$
begin
  if (new.werkadres_straat     is distinct from old.werkadres_straat)
  or (new.werkadres_huisnummer is distinct from old.werkadres_huisnummer)
  or (new.werkadres_postcode   is distinct from old.werkadres_postcode)
  or (new.werkadres_stad       is distinct from old.werkadres_stad) then
    new.adres_lat      := null;
    new.adres_lng      := null;
    new.geocode_status := null;
    new.geocode_op     := null;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists dossiers_geocode_reset_trg on public.dossiers;
create trigger dossiers_geocode_reset_trg
  before update on public.dossiers
  for each row execute function public.dossiers_geocode_reset();
