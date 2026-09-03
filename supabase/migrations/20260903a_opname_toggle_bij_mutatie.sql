-- Dossiers met categorie "Mutatie" krijgen de opname-toggle standaard aan.
--
-- WAAROM EEN DATABASETRIGGER EN GEEN STANDAARDWAARDE BIJ HET UITLEZEN
--
-- Het lag voor de hand om in `getDossierToggles()` een default terug te geven. Dat zou de UI
-- kloppend maken maar de rest niet: een dossier-toggle is óók een bron voor actielijst-triggers,
-- zowel als gebeurtenis (`toggle_aan`, geënqueued door tg_dossier_toggle_events) als als conditie
-- (`soort: 'toggle'`, gelezen uit laadDossierContext). Een gedachte-default zou daar onzichtbaar
-- zijn: de tab staat aan, maar een trigger-regel op die toggle vuurt nooit. Een echte rij houdt
-- alle drie de wegen gelijk.
--
-- En het moet in de database, niet in de applicatie: mutatiedossiers komen binnen via de
-- Bouw7-sync, niet via een scherm. Een haakje in de UI-code zou precies het pad missen waar het om
-- gaat.
--
-- ON CONFLICT DO NOTHING is hier de kern. Wie de toggle bewust UITzet, krijgt een rij met
-- aan = false (setDossierToggle doet een upsert, geen delete). Die rij blijft dus staan en wordt
-- nooit overschreven — niet bij de volgende sync, en niet als de categorie opnieuw wordt gezet.
-- "Standaard aan" betekent hier: aan tenzij iemand iets anders koos.
--
-- Een categorie die later van Mutatie AF gaat, zet de toggle bewust niet uit: er kan al een opname
-- aan het dossier hangen, en die hoort niet uit beeld te verdwijnen door een administratieve
-- herindeling.

create or replace function public.tg_dossier_opname_toggle_bij_mutatie()
returns trigger language plpgsql
set search_path = public
as $fn$
declare
  def_id uuid;
begin
  -- Case-ongevoelig en getrimd: de waarde komt uit Bouw7 (bouw7_categorie_naam) en daar is de
  -- schrijfwijze niet gegarandeerd.
  if lower(btrim(coalesce(new.categorie, ''))) <> 'mutatie' then
    return null;
  end if;

  select id into def_id
  from public.dossier_toggle_definities
  where sleutel = 'mutatie_opname' and actief
  limit 1;

  -- Toggle-definitie weg of inactief: dan is er niets aan te zetten. Stil overslaan in plaats van
  -- de insert/update van het dossier laten klappen.
  if def_id is null then
    return null;
  end if;

  insert into public.dossier_toggles (dossier_id, definitie_id, aan)
  values (new.id, def_id, true)
  on conflict (dossier_id, definitie_id) do nothing;

  return null;
end $fn$;

comment on function public.tg_dossier_opname_toggle_bij_mutatie() is
  'Zet de toggle mutatie_opname aan op dossiers met categorie Mutatie. Raakt een bestaande stand nooit aan, zodat handmatig uitzetten blijft staan.';

drop trigger if exists dossier_opname_toggle_bij_mutatie on public.dossiers;
create trigger dossier_opname_toggle_bij_mutatie
  after insert or update of categorie on public.dossiers
  for each row execute function public.tg_dossier_opname_toggle_bij_mutatie();

-- ── Backfill voor de bestaande mutatiedossiers ───────────────────────────────
-- Dezelfde ON CONFLICT-regel: dossiers waar al een keuze voor is gemaakt blijven ongemoeid.
insert into public.dossier_toggles (dossier_id, definitie_id, aan)
select d.id, def.id, true
from public.dossiers d
cross join lateral (
  select id from public.dossier_toggle_definities
  where sleutel = 'mutatie_opname' and actief limit 1
) def
where lower(btrim(coalesce(d.categorie, ''))) = 'mutatie'
on conflict (dossier_id, definitie_id) do nothing;
