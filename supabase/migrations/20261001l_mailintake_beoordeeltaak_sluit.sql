-- De actie "beoordeel dit bericht" gaat op gereed zodra het bericht is afgehandeld.
--
-- WAAROM EEN TRIGGER EN GEEN CODE
-- Een bericht wordt op vijf plekken afgerond: een dossier aanmaken, koppelen aan een
-- bestaand dossier, een offerte winnen, negeren, en "geen aanvraag". Vier daarvan
-- kunnen ook door de cron lopen, zonder sessie. Die vijf regels los laten sluiten
-- betekent dat de zesde die er ooit bij komt het vergeet -- en dat is precies wat er
-- nu gebeurde: drie afgehandelde berichten hadden hun actie nog open staan.
--
-- WELKE ACTIE WEL EN WELKE NIET
-- Aan een bericht kunnen meerdere acties hangen, en de meeste moeten juist blijven
-- staan: de eerste actie op het nieuwe dossier die de behandelaar zelf typt ("opname
-- inplannen"), "controleer automatisch aangemaakt dossier", "verkooptermijnen
-- instellen", de meerwerkvragen aan de projectleider. Dat is werk op het dossier en
-- dat is niet gedaan omdat de mail gelezen is.
--
-- Alleen de actie die zégt "kijk naar dit binnengekomen bericht" hoort mee te sluiten.
-- Die is nu expliciet gemarkeerd in plaats van afgeleid uit het ontbreken van een
-- dossier; een trigger die stil acties afsluit mag niet gokken wélke.

alter table public.tasks
  add column if not exists mailintake_beoordeeltaak boolean not null default false;

comment on column public.tasks.mailintake_beoordeeltaak is 'Deze actie vraagt om een binnengekomen mailintake-bericht te beoordelen. Gaat automatisch op gereed zodra dat bericht is afgehandeld (zie tg_mailintake_sluit_beoordeeltaak). Andere acties op hetzelfde bericht gaan over het dossier en blijven staan.';

-- Bestaande acties: alle acties aan een bericht zonder dossier zijn beoordeelacties.
-- Dat is in productie ook letterlijk zo -- alle zesenveertig heten "Beoordeel ..." --
-- maar vanaf nu zet de code de vlag zelf.
update public.tasks
   set mailintake_beoordeeltaak = true
 where mailintake_bericht_id is not null
   and dossier_id is null
   and not mailintake_beoordeeltaak;

create or replace function public.tg_mailintake_sluit_beoordeeltaak()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 'mislukt' staat er bewust niet bij: dan is het bericht juist níet afgehandeld en
  -- moet de actie blijven staan.
  if new.status is distinct from old.status
     and new.status in ('verwerkt', 'genegeerd', 'geen_aanvraag') then

    -- Eén statement: het sluiten en het spoor dat het sluiten achterlaat horen bij
    -- elkaar. Zelfde spoor als een handmatige afronding, zodat in de taakhistorie
    -- zichtbaar blijft dat niet een mens maar de afhandeling hem gesloten heeft.
    with gesloten as (
      update public.tasks
         set status = 'gereed',
             updated_at = now()
       where mailintake_bericht_id = new.id
         and mailintake_beoordeeltaak
         and status not in ('gereed', 'vervallen')
      returning id
    )
    -- `oud_waarde` blijft leeg: RETURNING levert de nieuwe rij, dus de oude status is
    -- hier niet meer te lezen. Liever niets vastleggen dan 'open' verzinnen.
    insert into public.task_audit_log (task_id, user_id, actie, nieuwe_waarde)
    select id, 'status_gewijzigd',
           jsonb_build_object('status', 'gereed',
                              'reden', 'mailintake-bericht afgehandeld',
                              'bericht_status', new.status)
      from gesloten;
  end if;

  return new;
end;
$$;

drop trigger if exists tg_mailintake_sluit_beoordeeltaak on public.mailintake_berichten;
create trigger tg_mailintake_sluit_beoordeeltaak
  after update of status on public.mailintake_berichten
  for each row
  execute function public.tg_mailintake_sluit_beoordeeltaak();

-- De achterstand: berichten die al afgehandeld zijn terwijl hun beoordeelactie nog
-- open staat. De trigger pakt alleen nieuwe overgangen; deze rijen zijn al over.
with gesloten as (
  update public.tasks t
     set status = 'gereed', updated_at = now()
    from public.mailintake_berichten b
   where b.id = t.mailintake_bericht_id
     and t.mailintake_beoordeeltaak
     and t.status not in ('gereed', 'vervallen')
     and b.status in ('verwerkt', 'genegeerd', 'geen_aanvraag')
  returning t.id, b.status as bericht_status
)
insert into public.task_audit_log (task_id, user_id, actie, nieuwe_waarde)
select id, 'status_gewijzigd',
       jsonb_build_object('status', 'gereed',
                          'reden', 'mailintake-bericht was al afgehandeld',
                          'bericht_status', bericht_status)
  from gesloten;
