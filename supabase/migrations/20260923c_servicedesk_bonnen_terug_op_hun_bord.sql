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
--    `aanvraag_substatus` moet mee: de CHECK `dossiers_status_consistent` eist een substatus bij
--    hoofdstatus 'aanvraag', en op deze rijen stond hij leeg omdat het dossier in de offerte- of
--    opdrachtfase zat.
--
-- 2. Een bon op Bouw7-status '01. Offerte' landde in de kolom "Offerte uitgebracht", terwijl 01
--    in Bouw7 juist de fase vóór de offerte is. Dezelfde uitzondering als in `servicedeskKolom`:
--    zegt de Bouw7-offertestatus dat er wél iets verstuurd (of al gewonnen/verloren/vervallen)
--    is, dan blijft de bon staan waar hij staat. Alleen de rest gaat terug naar Nieuw, en een
--    kolom die iemand met de hand heeft gezet blijft onaangeroerd.

-- 1. Terug naar de aanvraag-fase, en de bescherming van die drie velden opheffen.
update public.dossiers
set hoofdstatus        = 'aanvraag',
    aanvraag_substatus = coalesce(aanvraag_substatus, 'nieuw'),
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
       or opdracht_substatus is not null
       or aanvraag_substatus is null);

-- 2. Verse bonnen terug naar de kolom Nieuw.
update public.dossiers
set servicedesk_substatus = 'nieuw'
where servicedesk_substatus = 'offerte_uitgebracht'
  and bouw7_projectstatus_naam = '01. Offerte'
  -- Zelfde lezing als mapOffertestatusNaarSubstatus: alleen deze woorden betekenen dat er
  -- werkelijk een offerte de deur uit is gegaan.
  and coalesce(bouw7_quotation_status, '') !~* '(verstuurd|gewonnen|verloren|vervallen|mondelinge)'
  and not coalesce(handmatige_velden @> array['servicedesk_substatus'], false);

-- De doorlooptijd leest `dossier_substatus_historie`; een reparatie hoort daar geen wissel in te
-- zetten die nooit heeft plaatsgevonden. De kolom klopte niet, dus er valt ook niets aan
-- doorlooptijd te corrigeren.
