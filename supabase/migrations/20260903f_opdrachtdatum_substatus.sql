-- Opdrachtdatum: ook vullen bij de substatussen Nieuwe opdracht / Werkvoorbereiding,
-- en ook bij INSERT.
--
-- Vervangt tg_dossier_procesdatums uit 20260717_dossier_procesdatums.sql. Die vulde de
-- opdrachtdatum alleen bij een wissel van hoofdstatus naar 'opdracht', en stond bovendien
-- op BEFORE UPDATE. Daardoor bleef het veld leeg bij:
--
--   1. dossiers die bij de Bouw7-sync meteen als opdracht binnenkomen (de INSERT-tak van
--      de upsert raakte de trigger nooit);
--   2. dossiers die al op hoofdstatus 'opdracht' stonden en pas daarna naar
--      nieuwe_opdracht of werkvoorbereiding gingen.
--
-- De hoofdstatus-tak blijft staan: mapBouw7NaarEvaStatus mapt een Bouw7-project dat op
-- '04. Onderhanden' staat rechtstreeks op substatus 'onderhanden' (lib/bouw7/status-map.ts),
-- zonder ooit door nieuwe_opdracht te gaan. Alleen op de twee substatussen filteren zou
-- die dossiers permanent leeg laten.

create or replace function public.tg_dossier_procesdatums() returns trigger as $$
declare
  ging_naar_opdracht boolean := false;
  werd_fin_gereed    boolean := false;
begin
  -- Expliciete tg_op-vertakking, en elke OLD-verwijzing staat in de else-tak.
  -- PostgreSQL garandeert geen short-circuit voor AND in een expressie, dus
  -- `new.x = 'y' and old.x is distinct from 'y'` kan OLD tóch evalueren; tijdens een
  -- INSERT geeft dat 'record "old" is not assigned yet' — een fout die pas bij de
  -- eerste insert opduikt en niet bij het draaien van deze migratie.
  if tg_op = 'INSERT' then
    ging_naar_opdracht := (new.hoofdstatus = 'opdracht');
    werd_fin_gereed    := (new.opdracht_substatus = 'financieel_gereed');
  else
    ging_naar_opdracht :=
         (new.hoofdstatus = 'opdracht' and old.hoofdstatus is distinct from 'opdracht')
      -- Tweede tak: dossier stond al op 'opdracht' en gaat nu (alsnog) naar een van de
      -- twee openingssubstatussen. Twee voorwaarden zijn hier niet optioneel:
      --   * new.opdrachtdatum is null — anders overschrijft een latere fasewissel een
      --     al vastgelegde opdrachtdatum;
      --   * old.opdracht_substatus is distinct from new.opdracht_substatus — de wissel
      --     moet écht plaatsvinden. Zou je alleen op 'opdrachtdatum is null' toetsen, dan
      --     stempelt de eerstvolgende Bouw7-sync — die honderden opdracht-dossiers als
      --     UPDATE aanraakt zónder dat de status wijzigt — ze allemaal op vandaag. Dat is
      --     dezelfde bulk-valkuil die onderaan 20260717_dossier_procesdatums.sql staat.
      or (new.opdrachtdatum is null
          and new.opdracht_substatus in ('nieuwe_opdracht', 'werkvoorbereiding')
          and old.opdracht_substatus is distinct from new.opdracht_substatus);

    werd_fin_gereed :=
         new.opdracht_substatus = 'financieel_gereed'
     and old.opdracht_substatus is distinct from 'financieel_gereed';
  end if;

  if ging_naar_opdracht then
    new.opdrachtdatum := now();
  end if;

  if werd_fin_gereed then
    new.financieel_gereed_op := now();
  end if;

  return new;
end;
$$ language plpgsql;

-- zz_-prefix blijft nodig: BEFORE-triggers vuren alfabetisch en dossier_status_change
-- promoveert offerte/gewonnen zélf naar hoofdstatus 'opdracht'. Deze moet daarná draaien.
drop trigger if exists zz_dossier_procesdatums on public.dossiers;
create trigger zz_dossier_procesdatums
  before insert or update on public.dossiers
  for each row execute function public.tg_dossier_procesdatums();

-- ── Restrisico van de INSERT-tak ─────────────────────────────────────
-- Bij een truncate-en-herimport van dossiers zou elk opdracht-dossier de importdatum als
-- opdrachtdatum krijgen. De reguliere Bouw7-sync is een upsert op onConflict 'bouw7_id' en
-- raakt bestaande rijen dus als UPDATE — het risico beperkt zich tot een bewuste herimport.
-- Doe je die ooit: zet deze trigger er tijdelijk omheen uit.
--
-- ── Nog steeds géén backfill ─────────────────────────────────────────
-- De redenering onderaan 20260717_dossier_procesdatums.sql blijft staan: de 254 dossiers
-- die in dossier_status_historie één microseconde delen zijn sync-runs, geen opdrachten.
-- Bestaande dossiers vullen zich vanzelf bij hun eerstvolgende echte fasewissel.
