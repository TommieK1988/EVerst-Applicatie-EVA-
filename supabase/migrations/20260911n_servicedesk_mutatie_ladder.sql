-- Servicedesk: twee kolomreeksen in plaats van één.
--
-- Door de servicedesk lopen twee trajecten die niets met elkaar te maken hebben. Dagelijks
-- onderhoud gaat over bonnen: mandaat toetsen, uitzetten, kosten verzamelen, factureren — werk op
-- regie. Mutatiewerk gaat over een woning tussen twee huurders: opname, offerte, werkvoorbereiding,
-- uitvoering — aangenomen werk. Op één bord met negen kolommen betekende dat voor elk dossier dat
-- de helft van de kolommen betekenisloos was.
--
-- Beide ladders blijven op dezelfde kolom `servicedesk_substatus` schrijven; alleen de getoonde
-- reeks verschilt (zie SERVICEDESK_MUTATIE_STATUSSEN in components/dossiers/types.ts). Gedeelde
-- sleutels houden zo hun historie in dossier_substatus_historie en hun Bouw7-koppeling. Er komen
-- daardoor maar twee waarden bij:
--
--   * opgenomen        — mutatie, gezet zodra de opname in het veld is afgerond (EVA-eigen).
--   * in_voorbereiding — mutatie, uit Bouw7-projectstatus "03. Werkvoorbereiding".

alter table public.dossiers
  drop constraint if exists dossiers_servicedesk_substatus_check;

alter table public.dossiers
  add constraint dossiers_servicedesk_substatus_check
  check (servicedesk_substatus is null or servicedesk_substatus in (
    'nieuw',
    'mandaat_verhoging',
    'opgenomen',
    'offerte_uitgebracht',
    'in_voorbereiding',
    'uitgezet',
    'ingepland',
    'loopt',
    'uitgevoerd',
    'kosten_compleet',
    'financieel_gereed'
  ));

-- ── Mutatiewerk staat standaard op Aangenomen ────────────────────────────────
--
-- Mutatiewerk wordt aangenomen, niet op regie. De kolomdefault blijft bewust 'regie' (dat klopt
-- voor dagelijks onderhoud, verreweg de grootste groep); voor mutatiedossiers zet deze trigger de
-- stand goed.
--
-- WAAROM EEN BEFORE-TRIGGER
-- Een BEFORE-trigger past `new` aan vóór het schrijven: één schrijfronde, geen recursie. Een
-- AFTER-trigger zou een tweede update op dezelfde rij nodig hebben en daarmee zichzelf opnieuw
-- aanroepen.
--
-- WAAROM IN DE DATABASE
-- Mutatiedossiers komen binnen via de Bouw7-sync, niet via een scherm. Een haakje in de UI-code zou
-- precies het pad missen waar het om gaat. Zelfde overweging als bij
-- 20260903a_opname_toggle_bij_mutatie.sql.
--
-- WAAROM DE REM OP facturatiemethode_handmatig ZIT
-- "Standaard aangenomen" is geen slot. Wie in het dossier bewust Regie kiest, zet daarmee
-- facturatiemethode_handmatig = true (zie updateServicedeskInstellingen), en die keuze blijft dan
-- staan — ook als de sync de categorie opnieuw wegschrijft. De Bouw7-sync schrijft `categorie` bij
-- élke upsert mee, dus zonder die rem zou elke synchronisatieronde een handmatige keuze wissen.

create or replace function public.tg_dossier_facturatie_bij_mutatie()
returns trigger language plpgsql
set search_path = public
as $fn$
begin
  -- Case-ongevoelig en getrimd: de waarde komt uit Bouw7 en daar is de schrijfwijze niet
  -- gegarandeerd.
  if lower(btrim(coalesce(new.categorie, ''))) = 'mutatie'
     and coalesce(new.facturatiemethode_handmatig, false) = false then
    new.facturatiemethode := 'termijnen';
  end if;
  return new;
end $fn$;

comment on function public.tg_dossier_facturatie_bij_mutatie() is
  'Zet facturatiemethode op termijnen (Aangenomen) bij categorie Mutatie, tenzij de methode handmatig is vastgezet.';

drop trigger if exists dossier_facturatie_bij_mutatie on public.dossiers;
create trigger dossier_facturatie_bij_mutatie
  before insert or update of categorie on public.dossiers
  for each row execute function public.tg_dossier_facturatie_bij_mutatie();

-- ── Backfill voor de bestaande mutatiedossiers ───────────────────────────────
-- Dezelfde rem: dossiers waar al bewust een methode voor is gekozen blijven ongemoeid.
update public.dossiers
set facturatiemethode = 'termijnen'
where lower(btrim(coalesce(categorie, ''))) = 'mutatie'
  and coalesce(facturatiemethode_handmatig, false) = false
  and facturatiemethode is distinct from 'termijnen';
