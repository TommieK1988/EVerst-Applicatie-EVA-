-- Een verwijderde offerte liet zijn goedkeurverzoek achter.
--
-- `goedkeuringen.object_id` is polymorf (offerte óf werkbegroting) en heeft daarom geen
-- referentiesleutel naar `quotes`. Verwijder je een concept-offerte -- bijvoorbeeld omdat je hem
-- opnieuw genereert uit de calculatie -- dan blijft de rij met status `aangevraagd` staan. Gevolg:
-- de widget Goedkeuren toont werk dat niet meer bestaat, de link erheen geeft een 404, en op het
-- dossier staat ondertussen een nieuwe offerte die allang goedgekeurd en verzonden is. Bij
-- 20261.00618 stond het verzoek van 6 augustus nog open terwijl de offerte van 7 augustus al de
-- deur uit was.
--
-- Deze trigger doet bij het verwijderen van een offerte hetzelfde als de knop "Intrekken":
-- de aanvraag naar `ingetrokken`, een gebeurtenis in het audit-spoor, en de openstaande taak
-- "Offerte controleren" op gereed.

create or replace function public.zz_offerte_verwijderd_trek_goedkeuring_in()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  g record;
begin
  for g in
    select id, dossier_id
      from public.goedkeuringen
     where object_type = 'offerte'
       and object_id = old.id
       and status = 'aangevraagd'
  loop
    update public.goedkeuringen
       set status = 'ingetrokken', updated_at = now()
     where id = g.id;

    insert into public.goedkeuring_gebeurtenissen (goedkeuring_id, actie, medewerker_id, detail)
    values (g.id, 'ingetrokken', null, jsonb_build_object('reden', 'offerte verwijderd'));

    -- De beoordeeltaak hoort mee te vervallen, maar alleen als er op dit dossier geen ánder
    -- offerteverzoek meer openstaat: die taak is op titel gededupliceerd en zou anders het
    -- verzoek van een nieuwere offerte meenemen.
    if g.dossier_id is not null and not exists (
      select 1 from public.goedkeuringen
       where dossier_id = g.dossier_id
         and object_type = 'offerte'
         and status = 'aangevraagd'
         and id <> g.id
    ) then
      update public.tasks
         set status = 'gereed'
       where dossier_id = g.dossier_id
         and titel = 'Offerte controleren'
         and status not in ('gereed', 'vervallen');
    end if;
  end loop;

  return old;
end;
$$;

drop trigger if exists zz_offerte_verwijderd_goedkeuring on public.quotes;
create trigger zz_offerte_verwijderd_goedkeuring
  after delete on public.quotes
  for each row execute function public.zz_offerte_verwijderd_trek_goedkeuring_in();

-- ─── De verzoeken die er nu al voor niets staan ──────────────────────────────

with wezen as (
  select g.id, g.dossier_id
    from public.goedkeuringen g
    left join public.quotes q on q.id = g.object_id
   where g.object_type = 'offerte'
     and g.status = 'aangevraagd'
     and q.id is null
),
bijgewerkt as (
  update public.goedkeuringen g
     set status = 'ingetrokken', updated_at = now()
    from wezen w
   where g.id = w.id
  returning g.id
)
insert into public.goedkeuring_gebeurtenissen (goedkeuring_id, actie, medewerker_id, detail)
select id, 'ingetrokken', null, jsonb_build_object('reden', 'offerte verwijderd (opgeschoond)')
  from bijgewerkt;

-- En de taken die daarbij hoorden, voor zover er op dat dossier niets meer openstaat.
update public.tasks t
   set status = 'gereed'
 where t.titel = 'Offerte controleren'
   and t.status not in ('gereed', 'vervallen')
   and t.dossier_id is not null
   and not exists (
     select 1 from public.goedkeuringen g
      where g.dossier_id = t.dossier_id
        and g.object_type = 'offerte'
        and g.status = 'aangevraagd'
   );
