-- Houdt `medewerkers.afdeling_id` en `medewerkers.afdeling` kloppend, in beide
-- richtingen. Hoort bij 20260920d.
--
-- 1) Bij een medewerker: afdeling_id is leidend zodra hij gezet is; anders wordt
--    hij uit de naam afgeleid. Het bestaande gedrag (afdeling leeg + functie
--    gevuld → afleiden uit de functie) blijft, alleen zet hij nu ook het id.
-- 2) Bij het hernoemen van een afdeling: de tekstkolom van alle gekoppelde
--    medewerkers loopt mee, zodat de acht naam-lezers blijven kloppen.

create or replace function medewerker_afdeling_synchroniseer()
returns trigger language plpgsql as $$
begin
  -- Afdeling leeg maar functie gevuld → afleiden uit de standaardafdeling van de
  -- functie. Dit is het gedrag van medewerker_afdeling_from_functie (20260701);
  -- een handmatig gezette afdeling wordt nog steeds nooit overschreven.
  if new.afdeling is null and new.afdeling_id is null and new.functie is not null then
    select a.naam, a.id into new.afdeling, new.afdeling_id
      from medewerker_functies f
      join medewerker_afdelingen a on a.id = f.standaard_afdeling_id
     where lower(f.naam) = lower(new.functie)
     limit 1;
  end if;

  if new.afdeling_id is not null then
    select a.naam into new.afdeling
      from medewerker_afdelingen a where a.id = new.afdeling_id;
  elsif new.afdeling is not null then
    select a.id into new.afdeling_id
      from medewerker_afdelingen a where lower(a.naam) = lower(new.afdeling);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_medewerker_afdeling_from_functie on medewerkers;
drop trigger if exists trg_medewerker_afdeling_synchroniseer on medewerkers;
create trigger trg_medewerker_afdeling_synchroniseer
  before insert or update of functie, afdeling, afdeling_id on medewerkers
  for each row execute function medewerker_afdeling_synchroniseer();

-- De oude functie blijft bestaan maar hangt nergens meer aan; expliciet weg zodat
-- niemand hem per ongeluk opnieuw aanhaakt.
drop function if exists medewerker_afdeling_from_functie();

create or replace function medewerker_afdeling_naam_propageer()
returns trigger language plpgsql as $$
begin
  if new.naam is distinct from old.naam then
    update public.medewerkers set afdeling = new.naam where afdeling_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_afdeling_naam_propageer on medewerker_afdelingen;
create trigger trg_afdeling_naam_propageer
  after update of naam on medewerker_afdelingen
  for each row execute function medewerker_afdeling_naam_propageer();
