-- Procesdatums op het dossier — Opdrachtdatum en Datum financieel gereed.
--
-- Beide worden door de database zelf bijgehouden, niet door de app: de overgang naar
-- hoofdstatus 'opdracht' gebeurt op meerdere plekken (handmatig via updateDossierSubstatus,
-- door de trigger dossier_status_change bij offerte/gewonnen, en door de Bouw7-sync die de
-- projectstatus overneemt). Eén trigger vangt al die schrijfpaden.
--
--   dossiers.opdrachtdatum        — moment dat het dossier van offerte naar opdracht ging
--   dossiers.financieel_gereed_op — moment dat de opdracht-substatus 'financieel_gereed' werd
--
-- Beide worden opnieuw gezet bij een hernieuwde overgang, zodat de datum altijd de laatste
-- feitelijke overgang weergeeft (en niet een fase die later is teruggedraaid).

alter table public.dossiers
  add column if not exists opdrachtdatum        timestamptz,
  add column if not exists financieel_gereed_op timestamptz;

comment on column public.dossiers.opdrachtdatum is
  'Moment dat het dossier naar hoofdstatus opdracht ging. Automatisch gezet door de trigger zz_dossier_procesdatums; niet handmatig bewerkbaar.';
comment on column public.dossiers.financieel_gereed_op is
  'Moment dat de opdracht-substatus financieel_gereed werd. Automatisch gezet door de trigger zz_dossier_procesdatums; niet handmatig bewerkbaar.';

-- Herijking van twee bestaande omschrijvingen (20260706_aanvraag_velden): deadline is de datum
-- waarop de offerte verzonden had moeten zijn, niet de gewenste opleverdatum. De werkelijke
-- opleverdatum leeft in oplever_momenten.opgeleverd_op.
comment on column public.dossiers.deadline is
  'Deadline: datum waarop de offerte verzonden had moeten zijn (optioneel, handmatig).';
comment on column public.dossiers.aanvraagdatum is
  'Datum van de aanvraag; handmatige overschrijving. Leeg = het dossier toont created_at.';

-- ── Trigger ──────────────────────────────────────────────────────────
-- Naam bewust met zz_-prefix: BEFORE-triggers vuren in alfabetische volgorde en
-- dossier_status_change promoveert offerte/gewonnen zélf naar hoofdstatus 'opdracht'.
-- Deze moet dus ná die trigger draaien, anders ziet hij de promotie niet.
create or replace function public.tg_dossier_procesdatums() returns trigger as $$
begin
  if new.hoofdstatus = 'opdracht' and old.hoofdstatus is distinct from 'opdracht' then
    new.opdrachtdatum := now();
  end if;

  if new.opdracht_substatus = 'financieel_gereed'
     and old.opdracht_substatus is distinct from 'financieel_gereed' then
    new.financieel_gereed_op := now();
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists zz_dossier_procesdatums on public.dossiers;
create trigger zz_dossier_procesdatums
  before update on public.dossiers
  for each row execute function public.tg_dossier_procesdatums();

-- ── Bewust géén backfill ─────────────────────────────────────────────
-- Overwogen en verworpen: dossier_status_historie lijkt een bron van echte
-- overgangsmomenten, maar is het niet. 254 dossiers delen daar één microseconde
-- (2026-06-09 18:33:34.631915) en er zijn meer van zulke bulkmomenten — dat zijn
-- Bouw7-sync-runs die statussen massaal hermappen, niet het moment waarop een
-- opdracht is verstrekt. Een opdrachtdatum van '9 juni 2026' op 254 dossiers oogt
-- gezaghebbend en is aantoonbaar onjuist; een leeg veld is eerlijker. Bestaande
-- dossiers blijven dus leeg tot hun eerstvolgende echte fasewissel.
