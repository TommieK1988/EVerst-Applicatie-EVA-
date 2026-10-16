-- Offertebewaking: opvolging per offerte, stilstand met reden, besluitdatum, automatische stap.
--
-- Alleen toevoegingen. Bestaande code leest deze kolommen niet en merkt er niets van.
--
--   opvolging      — null = automatisch op bedragklasse (onder € 3k niet nabellen, daarboven wel);
--                    'altijd' = toch nabellen (een kleine offerte bij een belangrijke klant);
--                    'niet'   = niet nabellen (afgestemd, of de klant belt zelf).
--   stil_reden     — waarom een offerte stilstaat. Vaste lijst, anders levert de rapportage
--                    twintig varianten van "klant denkt na" op.
--   besluit_datum  — wanneer de klant beslist (ALV, begroting). Los van stap_datum: bij een
--                    mega-offerte ligt de hercontrole eerder dan het besluit.
--   stap_bron      — erbij: 'automatisch', de ontvangstcontrole die EVA zelf inplant na verzenden.
--                    Een actie uit de actielijst mag hem overschrijven; een menselijke uitkomst ook.

alter table public.commercie_bewaking
  add column if not exists opvolging text
    check (opvolging in ('altijd', 'niet')),
  add column if not exists stil_reden text
    check (stil_reden in (
      'klant_beoordeelt', 'besluit_alv', 'budget_later', 'aanpassing_door_ons',
      'wacht_op_adviseur', 'geen_reactie'
    )),
  add column if not exists besluit_datum date;

alter table public.commercie_bewaking drop constraint if exists commercie_bewaking_stap_bron_check;
alter table public.commercie_bewaking add constraint commercie_bewaking_stap_bron_check
  check (stap_bron in ('handmatig', 'actie', 'automatisch'));

comment on column public.commercie_bewaking.opvolging is
  'null = automatisch op bedragklasse; altijd = toch nabellen; niet = niet nabellen.';
comment on column public.commercie_bewaking.stil_reden is
  'Waarom de offerte stilstaat; vaste lijst (zie lib/commercie/opvolging.ts).';
comment on column public.commercie_bewaking.besluit_datum is
  'Wanneer de klant beslist (ALV, begroting); kan later liggen dan de hercontrole.';

-- Instellingen in de vrije JSON-bak van bedrijfsinstellingen (zelfde patroon als
-- offerte_geldigheid_dagen):
--   offerte_ontvangstcontrole_medewerker_id — wie na verzenden nabelt of de offerte binnen is.
--   offerte_automatisering_vanaf            — alleen offertes die vanaf deze datum verzonden zijn
--                                             krijgen automatisch een ontvangstcontrole of vervallen
--                                             automatisch; de bestaande voorraad blijft met rust.
update public.bedrijfsinstellingen
set overige = coalesce(overige, '{}'::jsonb)
  || jsonb_strip_nulls(jsonb_build_object(
       'offerte_ontvangstcontrole_medewerker_id',
       (select id::text from public.medewerkers
         where voornaam = 'Marjolein' and achternaam = 'Meer' and actief limit 1),
       'offerte_automatisering_vanaf', '2026-10-16'))
where id = 1
  and not (coalesce(overige, '{}'::jsonb) ? 'offerte_automatisering_vanaf');
