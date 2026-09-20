-- `financieel_gereed_op` ook stempelen bij een servicedeskbon.
--
-- De trigger uit 20260903f_opdrachtdatum_substatus.sql keek alleen naar `opdracht_substatus`.
-- Een servicedeskbon draagt zijn fase in `servicedesk_substatus` en bleef daardoor ongestempeld:
-- meting 20 sep 2026 → 241 bonnen op 'financieel_gereed', 0 met een datum.
--
-- Die datum is nu dragend: de kolom "Financieel gereed" op Opdrachten en Servicedesk toont
-- alleen nog wat de afgelopen 7 dagen gereed is gemeld; daarna verhuist het dossier naar
-- Afgesloten. Zonder stempel zou een servicedeskbon daar nooit verschijnen.
--
-- ── Bewust géén backfill ──────────────────────────────────────────────
-- De bestaande 241 servicedeskbonnen en 37 opdrachten zonder stempel blijven leeg. Ze zijn
-- daarmee meteen "ouder dan 7 dagen" en staan dus alleen op Afgesloten — precies waar ze horen.
-- Een backfill uit `dossier_substatus_historie` zou een schijndatum opleveren (die tabel wordt
-- gedomineerd door Bouw7-sync-runs die statussen massaal hermappen; zie de notitie onderaan
-- 20260717_dossier_procesdatums.sql), en de jongste rij daar staat op 10 sep 2026 — buiten het
-- venster van 7 dagen. Er raakt dus niets recents uit beeld.

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
    werd_fin_gereed    := (new.opdracht_substatus    = 'financieel_gereed')
                       or (new.servicedesk_substatus = 'financieel_gereed');
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

    -- Beide ladders stempelen dezelfde kolom. Dat mag: een dossier is óf een opdracht óf een
    -- servicedeskbon, nooit allebei op 'financieel_gereed' (meting 20 sep 2026: 0 overlap).
    -- De `is distinct from`-guard is hier net zo hard nodig als hierboven — de lees-sync raakt
    -- elke bon als UPDATE aan en zou anders de hele kolom elke nacht op vandaag zetten.
    werd_fin_gereed :=
         (new.opdracht_substatus = 'financieel_gereed'
          and old.opdracht_substatus is distinct from 'financieel_gereed')
      or (new.servicedesk_substatus = 'financieel_gereed'
          and old.servicedesk_substatus is distinct from 'financieel_gereed');
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

comment on column public.dossiers.financieel_gereed_op is
  'Moment waarop het dossier financieel gereed is gemeld (opdracht_substatus of '
  'servicedesk_substatus = financieel_gereed). Gezet door zz_dossier_procesdatums. '
  'Draagt de 7-daagse nawerktijd van de kolom "Financieel gereed" op Opdrachten en '
  'Servicedesk; leeg = langer geleden, dossier staat alleen nog op Afgesloten.';
