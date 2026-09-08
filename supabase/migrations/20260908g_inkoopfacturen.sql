-- Inkoopfacturen: crediteuren uit Bouw7 in EVA, met accorderen en betaalrondes.
--
-- Bouw7 blijft de bron van waarheid voor het fiscale document (bedrag, BTW, factuurnummer,
-- boekstuk). EVA leest die facturen, spiegelt de goedkeuringsworkflow en voegt twee eigen
-- dingen toe die Bouw7 niet heeft: een opmerkingen-/auditspoor dat niet overschreven kan
-- worden, en een betaalronde-selectie voor de directie.
--
-- Kolomsplitsing, overgenomen van `debiteuren` (20260623e):
--   * Bouw7-bronkolommen worden door de sync ge-upsert;
--   * EVA-kolommen komen NOOIT in de upsert-payload voor en overleven dus elke re-sync;
--   * afgeleide waarden (dagen tot vervaldatum, stoplicht) worden NIET opgeslagen --
--     die veranderen dagelijks en worden at-read berekend.
--
-- Verschil met `debiteuren`: de RLS volgt hier de nieuwe basislijn (20260705) met
-- `is_platform_gebruiker()`, niet het oude `using (true)`. Deze tabellen bevatten
-- leveranciers-, bedrag- en overheadgegevens; `authenticated` omvat ook klantportaal-accounts.

-- == 1. Betaalrondes =========================================================
-- Een betaalronde is een door de directie samengestelde bundel goedgekeurde facturen.
-- EVA maakt zelf geen betaling aan; de ronde is een lijst + export waarmee de
-- administratie de betaling in Exact Online klaarzet. `exact_batch_id` is gereserveerd
-- voor het moment dat die koppeling er wel komt.
create table if not exists public.betaalrondes (
  id                uuid        primary key default gen_random_uuid(),
  naam              text        not null,
  betaaldatum       date,
  status            text        not null default 'open'
                      check (status in ('open','vrijgegeven','afgerond')),
  opmerking         text,
  aangemaakt_door   uuid        references public.medewerkers(id) on delete set null,
  vrijgegeven_op    timestamptz,
  vrijgegeven_door  uuid        references public.medewerkers(id) on delete set null,
  exact_batch_id    text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists betaalrondes_status_idx on public.betaalrondes (status);

-- == 2. Inkoopfacturen (een rij per Bouw7-inkoopfactuur) =====================
create table if not exists public.inkoopfacturen (
  id                        uuid           primary key default gen_random_uuid(),

  -- -- Bouw7-bron: /list/purchase-invoices (door sync gevuld, nooit door gebruiker bewerkt)
  bouw7_invoice_id          text           not null,
  factuurnummer             text,
  betalingskenmerk          text,
  boekstuknummer            text,
  bouw7_status              integer,
  -- EVA's eigen levenscyclus: 'open' zolang de factuur in de onbetaalde Bouw7-lijst staat.
  status                    text           not null default 'open'
                              check (status in ('open','afgehandeld')),

  leverancier_bouw7_id      text,
  leverancier_naam          text,
  leverancier_type          text,
  leverancier_relatie_id    uuid           references public.relaties(id)  on delete set null,

  bouw7_project_id          text,
  project_naam              text,
  project_nummer            text,
  dossier_id                uuid           references public.dossiers(id)  on delete set null,

  divisie_bouw7_id          integer,
  divisie_naam              text,
  divisie_exact_id          text,
  journaalcode_inkoop       text,
  vestiging_naam            text,

  bedrag_excl               numeric(14,2),
  btw_bedrag                numeric(14,2),
  bedrag_incl               numeric(14,2),
  factuurdatum              date,
  vervaldatum               date,
  datum_betaald             date,

  bouw7_opmerking           text,
  ordernummer               text,
  bon_nummer                text,
  bon_omschrijving          text,

  is_muteerbaar             boolean,
  is_geboekt_in_exact       boolean,
  is_geboekt_in_twinfield   boolean,
  uit_basecone              boolean,
  keten_verloopt_op         date,

  bouw7_aangemaakt_op       timestamptz,
  bouw7_gewijzigd_op        timestamptz,

  -- -- Bouw7-approval: /purchase-invoicing/purchase-invoice/{id} (sync-owned)
  bouw7_approval_id                      text,
  approval_workflow_id                   text,
  approval_index                         integer,
  approval_is_goedgekeurd                boolean,
  approval_kan_accorderen                boolean,
  huidige_goedkeurder_naam               text,
  huidige_goedkeurder_bouw7_employee_id  text,
  huidige_goedkeurder_id                 uuid references public.medewerkers(id) on delete set null,
  approval_laatste_actie_op              timestamptz,
  approval_laatst_gelezen_op             timestamptz,

  -- -- EVA (overleeft re-sync; nooit door de sync overschreven)
  betaalronde_id            uuid           references public.betaalrondes(id) on delete set null,
  betaalronde_op            timestamptz,
  betaalronde_door          uuid           references public.medewerkers(id)  on delete set null,
  betaalronde_notitie       text,
  notificatie_voor_id       uuid           references public.medewerkers(id)  on delete set null,
  laatste_vote_op           timestamptz,
  laatste_vote_fout         text,

  -- -- Exact Online: nu leeg. Gereserveerd zodat de koppeling later zonder datamigratie kan.
  exact_entry_id            text,
  exact_document_id         text,
  exact_payment_id          text,
  exact_status              text,
  exact_laatst_sync         timestamptz,

  -- -- Sync-meta
  bouw7_sync_hash           text,
  bouw7_laatst_sync         timestamptz,
  created_at                timestamptz    not null default now(),
  updated_at                timestamptz    not null default now()
);

comment on column public.inkoopfacturen.bouw7_status is
  'Bouw7-status. Er is geen officiele enum in de Bouw7-spec; deze mapping is afgeleid uit alle '
  '3040 live facturen (8 sep 2026): 0=concept (28, zonder approval-object), 1=ter goedkeuring (150), '
  '2=goedgekeurd/te betalen (375), 4=betaald (2481, waarvan 2480 met datePaid), '
  '5=afgekeurd/bezwaar (6). Bij afwijkend gedrag eerst opnieuw meten voordat de mapping wijzigt. '
  'Zie ook BOUW7_INKOOPSTATUS in lib/bouw7/inkoop-status.ts, dat is dezelfde mapping in code.';

comment on column public.inkoopfacturen.bouw7_project_id is
  'Bouw7 project.id, ALTIJD gevuld als de factuur aan een project hangt, ook wanneer er geen '
  'EVA-dossier bij gevonden is. Dit veld draagt de rechten-scope: wie het recht '
  'inkoopfacturen_alle niet heeft, ziet uitsluitend rijen waar dit gevuld is (plus de facturen '
  'waar hij zelf goedkeurder van is). Filter dus hierop, niet op dossier_id.';

comment on column public.inkoopfacturen.huidige_goedkeurder_naam is
  'Naam-string uit /list/purchase-invoices. Alleen voor weergave zolang het approval-detail nog '
  'niet is opgehaald. NOOIT op matchen: namen zijn niet uniek en een mismatch zou de verkeerde '
  'persoon een accordeerknop geven. De koppeling loopt via huidige_goedkeurder_bouw7_employee_id.';

comment on column public.inkoopfacturen.approval_kan_accorderen is
  'De canApprove-vlag zoals Bouw7 die teruggeeft aan de EVA-servicesleutel. Diagnostisch: onze '
  'sleutel is geen medewerker, dus dit is in de praktijk altijd false. Niet gebruiken om te '
  'bepalen of de ingelogde gebruiker mag stemmen, dat doet huidige_goedkeurder_id.';

comment on column public.inkoopfacturen.approval_laatst_gelezen_op is
  'Wanneer het approval-detail voor het laatst is opgehaald. Stuurt de volgorde van de '
  'detail-calls in de sync (oudste eerst), zodat een achterstand over meerdere runs leegloopt.';

create unique index if not exists inkoopfacturen_bouw7_invoice_id_key
  on public.inkoopfacturen (bouw7_invoice_id);
create index if not exists inkoopfacturen_project_idx
  on public.inkoopfacturen (bouw7_project_id) where bouw7_project_id is not null;
create index if not exists inkoopfacturen_dossier_idx
  on public.inkoopfacturen (dossier_id) where dossier_id is not null;
create index if not exists inkoopfacturen_goedkeurder_idx
  on public.inkoopfacturen (huidige_goedkeurder_id) where huidige_goedkeurder_id is not null;
create index if not exists inkoopfacturen_bouw7_status_idx on public.inkoopfacturen (bouw7_status);
create index if not exists inkoopfacturen_status_idx       on public.inkoopfacturen (status);
create index if not exists inkoopfacturen_vervaldatum_idx  on public.inkoopfacturen (vervaldatum);
create index if not exists inkoopfacturen_betaalronde_idx
  on public.inkoopfacturen (betaalronde_id) where betaalronde_id is not null;
-- Werkvoorraad van de sync: welke facturen hebben een verse approval-detailcall nodig.
create index if not exists inkoopfacturen_approval_ververs_idx
  on public.inkoopfacturen (approval_laatst_gelezen_op nulls first) where status = 'open';

-- == 3. Goedkeurdersketen (spiegel van approval.approvers[]) =================
-- Read-only spiegel: de sync schrijft, EVA leest. De opmerking hier is die van Bouw7 zelf.
create table if not exists public.inkoopfactuur_goedkeurders (
  id                 uuid        primary key default gen_random_uuid(),
  inkoopfactuur_id   uuid        not null references public.inkoopfacturen(id) on delete cascade,
  bouw7_approver_id  text        not null,
  volgorde           integer,
  bouw7_employee_id  text,
  medewerker_id      uuid        references public.medewerkers(id) on delete set null,
  -- Naam-snapshot: een goedkeurder kan uit dienst zijn of nooit aan EVA gekoppeld.
  naam               text,
  status             integer,
  besloten_op        timestamptz,
  opmerking          text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on column public.inkoopfactuur_goedkeurders.status is
  'approvalStatus uit Bouw7: 0=open (nog niet gestemd), 1=afgekeurd/bezwaar, 2=goedgekeurd. '
  'Gemeten op de live API, 8 sep 2026.';

create unique index if not exists inkoopfactuur_goedkeurders_uniek
  on public.inkoopfactuur_goedkeurders (inkoopfactuur_id, bouw7_approver_id);
create index if not exists inkoopfactuur_goedkeurders_medewerker_idx
  on public.inkoopfactuur_goedkeurders (medewerker_id) where medewerker_id is not null;

-- == 4. EVA-opmerkingen ======================================================
-- Twee soorten in een thread:
--   naar_bouw7 = true  -> deze tekst is als vote-comment naar Bouw7 gestuurd. EVA bewaart een
--                         onwisbare kopie: Bouw7 houdt per goedkeurder maar een comment per
--                         ronde, en een herstart van de workflow kan die overschrijven.
--   naar_bouw7 = false -> vrije EVA-notitie ("gebeld met leverancier, creditnota onderweg").
--                         Die hoort NIET in approval.comment: daar zou hij de afkeurreden
--                         overschrijven.
create table if not exists public.inkoopfactuur_opmerkingen (
  id                uuid        primary key default gen_random_uuid(),
  inkoopfactuur_id  uuid        not null references public.inkoopfacturen(id) on delete cascade,
  medewerker_id     uuid        references public.medewerkers(id) on delete set null,
  tekst             text        not null,
  naar_bouw7        boolean     not null default false,
  created_at        timestamptz not null default now()
);

create index if not exists inkoopfactuur_opmerkingen_factuur_idx
  on public.inkoopfactuur_opmerkingen (inkoopfactuur_id, created_at);

-- == 5. Audit ================================================================
-- Zelfde vorm als goedkeuring_gebeurtenissen (20260703): een rij per actie, vrije detail-jsonb.
-- 'vote_mislukt' is bewust een eigen actie: als Bouw7 de stem weigert, mag er geen goedkeuring
-- in EVA staan, maar moet wel navolgbaar zijn dat het geprobeerd is.
create table if not exists public.inkoopfactuur_gebeurtenissen (
  id                uuid        primary key default gen_random_uuid(),
  inkoopfactuur_id  uuid        not null references public.inkoopfacturen(id) on delete cascade,
  actie             text        not null
                      check (actie in ('goedgekeurd','afgekeurd','opmerking','vote_mislukt',
                                       'betaalronde_toegevoegd','betaalronde_verwijderd',
                                       'betaalronde_afgerond')),
  medewerker_id     uuid        references public.medewerkers(id) on delete set null,
  detail            jsonb       not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);

create index if not exists inkoopfactuur_gebeurtenissen_factuur_idx
  on public.inkoopfactuur_gebeurtenissen (inkoopfactuur_id, created_at desc);

-- == 6. updated_at-triggers (hergebruik tg_set_updated_at) ===================
do $triggers$
declare
  t text;
  tabellen text[] := array['betaalrondes','inkoopfacturen','inkoopfactuur_goedkeurders'];
begin
  foreach t in array tabellen loop
    if not exists (select 1 from pg_trigger where tgname = 'set_updated_at_' || t) then
      execute format(
        'create trigger set_updated_at_%I before update on public.%I
           for each row execute function public.tg_set_updated_at()', t, t);
    end if;
  end loop;
end $triggers$;

-- == 7. RLS (basislijn 20260705: platform-gebruikers, geen using(true)) ======
-- Vangnet, geen fijnmazige autorisatie: de rechten-scope (wie ziet alles, wie alleen
-- projectgebonden facturen) wordt in de server-actions afgedwongen, waar met de
-- admin-client wordt gelezen.
do $rls$
declare
  t text;
  tabellen text[] := array['betaalrondes','inkoopfacturen','inkoopfactuur_goedkeurders',
                           'inkoopfactuur_opmerkingen','inkoopfactuur_gebeurtenissen'];
begin
  foreach t in array tabellen loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists platform_gebruikers_all on public.%I', t);
    execute format(
      'create policy platform_gebruikers_all on public.%I for all to authenticated using (is_platform_gebruiker()) with check (is_platform_gebruiker())',
      t
    );
  end loop;
end $rls$;
