-- Servicedesk: één bord — stap A (additief, mag vóór de code live staat).
--
-- Dagelijks onderhoud en mutatie delen voortaan één kolomreeks:
--   Nieuw · Wachten op opdrachtgever · In voorbereiding · Onderhanden · Uitvoering gereed ·
--   Kosten compleet · Financieel gereed
-- plus `vervallen` zonder kolom (die bon staat alleen nog onder Afgesloten).
--
-- Deze stap voegt alleen de twee nieuwe waarden toe. De oude waarden (mandaat_verhoging,
-- offerte_uitgebracht, opgenomen, uitgezet, ingepland) blijven toegestaan zolang de huidige
-- productiecode ze nog schrijft. Het omzetten van de rijen en het versmallen van de constraint
-- gebeurt in stap B (20260930c), pas nadat de nieuwe code op main staat.

alter table public.dossiers
  drop constraint if exists dossiers_servicedesk_substatus_check;

alter table public.dossiers
  add constraint dossiers_servicedesk_substatus_check
  check (servicedesk_substatus is null or servicedesk_substatus in (
    'nieuw',
    'wacht_op_opdrachtgever',
    'in_voorbereiding',
    'loopt',
    'uitgevoerd',
    'kosten_compleet',
    'financieel_gereed',
    'vervallen',
    -- oud, verdwijnt in stap B
    'mandaat_verhoging',
    'opgenomen',
    'offerte_uitgebracht',
    'uitgezet',
    'ingepland'
  ));

-- Spiegel van isActiefDossier() in apps/dashboard/src/lib/dossiers/actief.ts: een vervallen bon is
-- niet meer actief.
create or replace view public.v_dossier_actief as
select d.id,
       (d.gearchiveerd is not true
        and case d.hoofdstatus::text
              when 'aanvraag' then coalesce(d.aanvraag_substatus::text, '') not in ('afgewezen', 'vervallen')
              when 'offerte'  then coalesce(d.offerte_substatus::text, '')  not in ('gewonnen', 'verloren', 'vervallen')
              when 'opdracht' then coalesce(d.opdracht_substatus::text, '') is distinct from 'financieel_afgesloten'
              else true
            end
        -- Servicedesk-overlay: geldt naast de fase-status, niet in plaats daarvan.
        and (d.servicedesk_substatus is null
             or d.servicedesk_substatus::text not in ('financieel_gereed', 'vervallen'))
       ) as actief
  from public.dossiers d;

comment on view public.v_dossier_actief is
  'SQL-spiegel van isActiefDossier() in lib/dossiers/actief.ts. Aanpassen zodra die functie wijzigt.';
