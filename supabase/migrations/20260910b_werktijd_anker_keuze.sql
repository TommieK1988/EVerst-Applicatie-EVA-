-- =====================================================================
-- Handmatig aanwijzen welke rit de werktijd bepaalt (R9 / R10)
-- =====================================================================
-- R9 leidt de aankomst op het werk af uit het einde van de eerste zakelijke
-- ritketen, R10 het vertrek uit het begin van de laatste. Dat klopt meestal,
-- maar niet altijd: een tussenstop van zes minuten knipt een keten in tweeen,
-- een vergeten privemarkering trekt de eerste keten naar voren, en soms weet
-- alleen de leidinggevende dat het depotbezoek van kwart voor vier gewoon werk
-- was. Tot nu toe kon je zo'n signaal alleen wegzetten als "verklaard" — het
-- getal bleef dan staan en gaf een verkeerd beeld.
--
-- Met deze tabel wijst een mens de bepalende rit zelf aan. De keuze is de
-- waarheid: de compliance-regels lezen hem mee, zodat de minuten, de ernst en
-- de omschrijving opnieuw worden berekend en op elk scherm hetzelfde zeggen.
-- Zonder rij hier blijft alles zoals de engine het zag.
--
-- Waarom een eigen tabel en niet een veld op de bevinding: elke compliance-run
-- herschrijft `compliance_bevindingen.data` volledig, dus een keuze die daar
-- staat overleeft de eerstvolgende nachtelijke controle niet. De sleutel is
-- bewust (bestuurder, datum, regel) en niet de bevinding-id: bij een gewijzigde
-- ernst krijgt een bevinding een nieuwe fingerprint en dus een nieuwe rij,
-- waarna een verwijzing op id in het niets zou wijzen.
-- =====================================================================

create table if not exists public.werktijd_anker_keuzes (
  id            uuid primary key default gen_random_uuid(),
  user_id_ulu   bigint not null references public.ulu_users(id) on delete cascade,
  datum         date not null,
  regel_code    text not null,
  -- De rit die de aankomst (R9) of het vertrek (R10) bepaalt. Verdwijnt de rit
  -- uit de registratie, dan verdwijnt de keuze mee en valt de dag terug op de
  -- automatische bepaling.
  trip_id       uuid not null references public.ulu_trips(id) on delete cascade,
  toelichting   text,
  gebruiker_id  uuid references auth.users(id) on delete set null,
  aangemaakt_op timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint werktijd_anker_keuzes_regel_check check (regel_code in ('R9', 'R10')),
  constraint werktijd_anker_keuzes_uniek unique (user_id_ulu, datum, regel_code)
);

create index if not exists werktijd_anker_keuzes_datum_idx
  on public.werktijd_anker_keuzes (datum);

alter table public.werktijd_anker_keuzes enable row level security;
-- Geen policies: net als de rest van de rittendata is dit alleen bereikbaar via
-- de directe Postgres-pooler, in code die achter de directie/beheer-poort zit.

do $$ begin
  if not exists (
    select 1 from pg_trigger where tgname = 'set_updated_at_werktijd_anker_keuzes'
  ) then
    create trigger set_updated_at_werktijd_anker_keuzes
      before update on public.werktijd_anker_keuzes
      for each row execute function public.tg_set_updated_at();
  end if;
end $$;

comment on table public.werktijd_anker_keuzes is
  'Handmatig aangewezen bepalende rit per bestuurder-dag voor R9/R10. De compliance-regels lezen deze keuze en herberekenen de afwijking erop; zonder rij geldt de automatische ritketen-bepaling.';
