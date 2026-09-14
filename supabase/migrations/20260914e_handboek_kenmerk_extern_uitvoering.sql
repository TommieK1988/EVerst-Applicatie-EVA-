-- =====================================================================
-- Handboek: het kenmerk 'extern' geldt alleen voor Uitvoering
-- =====================================================================
-- `medewerkers.extern` betekent "niet in loondienst" en zegt dus iets over de
-- contractvorm, niet over het soort werk. Op kantoor klopt die vlag wél maar
-- zegt hij niets: twee directieleden en twee mensen van het Projectbureau
-- staan als extern terwijl voor hen gewoon het volledige handboek geldt. Zij
-- kregen daardoor de Flexkrachten-versie te zien — zonder Personeelsvereniging,
-- Functies, Persoonlijke ontwikkeling, Auto of bus en Mobiele telefoon, en met
-- de flextekst bij Kleding en Ziekte.
--
-- Het Flexkrachten-handboek is geschreven voor ingehuurde vakmensen op de bouw.
-- Dat is precies de combinatie extern + afdeling Uitvoering; vandaar deze
-- scoping. Effect: 9 van de 13 externen krijgen de flexversie, de andere 4 het
-- volledige handboek.
--
-- Wie extern is zonder afdeling telt bewust als intern. Iemand het volledige
-- handboek geven dat te ruim is, is minder erg dan hem regels onthouden die
-- wél voor hem gelden — en een ontbrekende afdeling is een gat in de gegevens,
-- geen uitspraak.

create or replace function public.handboek_kenmerken()
returns text[]
language sql
security definer
set search_path = public
stable
as $fn$
  with mw as (
    select
      m.id,
      -- `is true` en niet gewoon `and`: bij een lege afdeling levert de
      -- vergelijking null op, en dan zou de medewerker in géén van beide
      -- takken vallen en helemaal geen kenmerk krijgen.
      (m.extern and m.afdeling = 'Uitvoering') is true as telt_als_flex,
      b.code as wm_code
    from public.medewerkers m
    left join public.bedrijfsgegevens b on b.id = m.werkmaatschappij_id
    where m.auth_user_id = auth.uid()
      and m.actief = true
    limit 1
  )
  select coalesce(
       array(select 'intern' from mw where not telt_als_flex)
    || array(select 'extern' from mw where telt_als_flex)
    || array(select 'werkmaatschappij:' || wm_code from mw where wm_code is not null)
    || array(
         select 'voertuig' from mw
          where exists (
            select 1
              from public.voertuig_bestuurders vb
             where vb.eind_datum is null
               and ( vb.medewerker_id = mw.id
                  or vb.ulu_user_id in (
                       select uu.id from public.ulu_users uu where uu.medewerker_id = mw.id) )
          )
       ),
    '{}'::text[]);
$fn$;

comment on function public.handboek_kenmerken() is
  'Kenmerken van de ingelogde medewerker voor de zichtbaarheid van handboek-inhoud. '
  'Enige vertaling van medewerkergegevens naar kenmerk-strings. '
  'Let op: ''extern'' geldt alleen voor afdeling Uitvoering — het Flexkrachten-handboek '
  'is voor ingehuurde vakmensen op de bouw, niet voor ingehuurde kantoormedewerkers.';
