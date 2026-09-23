-- Servicedeskbonnen die op het verkeerde bord of in de verkeerde kolom stonden.
--
-- Twee dingen liepen mis, beide opgelost in de code (lib/bouw7/status-afleiding.ts en de
-- bordqueries in lib/dossiers/actions.ts). Deze migratie ruimt op wat er al stond: de
-- Bouw7-sync is incrementeel en raakt een project pas aan als daar iets verandert, dus zonder
-- deze reparatie blijven de bestaande rijen scheef staan.
--
-- 1. Een bon met een hoofdstatus 'offerte' of 'opdracht' stond naast het servicedeskbord óók
--    tussen de offertes. Op een bon is die hoofdstatus per definitie fout: `mapBouw7NaarEvaStatus`
--    zet hem altijd op 'aanvraag'. Hij kwam er via een statuswijziging in EVA en bleef staan
--    omdat `handmatige_velden` de sync tegenhield — een bescherming die hier een verkeerde
--    waarde beschermde.
--
-- 2. Een bon op Bouw7-status '01. Offerte' landde in de kolom "Offerte uitgebracht", terwijl 01
--    in Bouw7 juist de fase vóór de offerte is. Alleen bonnen waarvan niets erop wijst dat er
--    een offerte de deur uit is (geen verzenddatum, geen calculatie) en die niet met de hand op
--    hun plek zijn gezet, gaan terug naar Nieuw.

-- 1. Terug naar de aanvraag-fase, en de bescherming van die drie velden opheffen.
update public.dossiers
set hoofdstatus        = 'aanvraag',
    offerte_substatus  = null,
    opdracht_substatus = null,
    handmatige_velden  = coalesce(
      array(
        select v from unnest(coalesce(handmatige_velden, '{}')) as v
        where v not in ('hoofdstatus', 'offerte_substatus', 'opdracht_substatus')
      ), '{}')
where servicedesk_substatus is not null
  and (hoofdstatus <> 'aanvraag'
       or offerte_substatus is not null
       or opdracht_substatus is not null);

-- 2. Verse bonnen terug naar de kolom Nieuw.
update public.dossiers
set servicedesk_substatus = 'nieuw'
where servicedesk_substatus = 'offerte_uitgebracht'
  and bouw7_projectstatus_naam = '01. Offerte'
  and verzonden_op is null
  and everts_calc_project_id is null
  and not coalesce(handmatige_velden @> array['servicedesk_substatus'], false);

-- De doorlooptijd leest `dossier_substatus_historie`; een reparatie hoort daar geen wissel in te
-- zetten die nooit heeft plaatsgevonden. De kolom klopte niet, dus er valt ook niets aan
-- doorlooptijd te corrigeren.
