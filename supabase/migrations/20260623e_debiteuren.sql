-- Debiteurenbeheer: openstaande verkoopfacturen (sync uit Bouw7) + opvolging/logboek.
--
-- Eén centraal Facturen-scherm. `debiteuren` houdt één rij per open Bouw7-verkoopfactuur
-- (natuurlijke sleutel = bouw7_invoice_id). De Bouw7-kolommen worden door de sync ge-upsert;
-- de opvolging-kolommen (reden/actie/actiehouder/datums/status/task_id) worden NOOIT door de
-- sync overschreven (upsert-payload bevat alleen de Bouw7-kolommen → Postgres laat de rest staan).
-- Dagen-na-factuur/-vervaldatum worden NIET opgeslagen (veranderen dagelijks → at-read berekend).

-- ── Redencodes (lookup, geseed + beheerbaar in instellingen) ──────────────────
create table if not exists public.debiteur_redencodes (
  id          uuid        primary key default gen_random_uuid(),
  code        text        not null,
  label       text        not null,
  volgorde    integer     not null default 0,
  actief      boolean     not null default true,
  created_at  timestamptz not null default now()
);

create unique index if not exists debiteur_redencodes_code_key
  on public.debiteur_redencodes (code);

-- ── Debiteuren (één rij per open verkoopfactuur) ──────────────────────────────
create table if not exists public.debiteuren (
  id                      uuid           primary key default gen_random_uuid(),

  -- Bouw7-bron (door sync gevuld, nooit door gebruiker bewerkt)
  bouw7_invoice_id        text           not null,
  bouw7_project_id        text,
  factuurnummer           text,
  klant_naam              text,
  klant_relatie_id        uuid           references public.relaties(id) on delete set null,
  project_titel           text,
  dossier_id              uuid           references public.dossiers(id) on delete set null,
  projectleider_id        uuid           references public.medewerkers(id) on delete set null,
  bedrag                  numeric(14,2),
  factuurdatum            date,
  vervaldatum             date,
  datum_betaald           date,
  is_credit               boolean        not null default false,
  bouw7_status            integer,
  status                  text           not null default 'open'
                            check (status in ('open','betaald','afgeschreven')),

  -- Opvolging (overleeft re-sync; nooit door sync overschreven)
  reden_code_id           uuid           references public.debiteur_redencodes(id) on delete set null,
  actie                   text,
  actiehouder_id          uuid           references public.medewerkers(id) on delete set null,
  verwachte_betaaldatum   date,
  opvolgdatum             date,
  opvolgstatus            text           not null default 'nieuw'
                            check (opvolgstatus in ('nieuw','loopt','wacht_op_klant','opgelost','geescaleerd')),
  task_id                 uuid           references public.tasks(id) on delete set null,
  laatste_reminder_op     date,

  -- Sync-meta
  bouw7_sync_hash         text,
  bouw7_laatst_sync       timestamptz,
  created_at              timestamptz    not null default now(),
  updated_at              timestamptz    not null default now()
);

create unique index if not exists debiteuren_bouw7_invoice_id_key on public.debiteuren (bouw7_invoice_id);
create index if not exists debiteuren_dossier_id_idx       on public.debiteuren (dossier_id)       where dossier_id is not null;
create index if not exists debiteuren_projectleider_id_idx on public.debiteuren (projectleider_id) where projectleider_id is not null;
create index if not exists debiteuren_status_idx           on public.debiteuren (status);
create index if not exists debiteuren_vervaldatum_idx      on public.debiteuren (vervaldatum);

-- ── Logboek (opmerking-historie per debiteur) ─────────────────────────────────
create table if not exists public.debiteur_logboek (
  id            uuid        primary key default gen_random_uuid(),
  debiteur_id   uuid        not null references public.debiteuren(id) on delete cascade,
  user_id       uuid        references auth.users(id) on delete set null,
  tekst         text        not null,
  aangemaakt_op timestamptz not null default now()
);

create index if not exists debiteur_logboek_debiteur_id_idx on public.debiteur_logboek (debiteur_id);

-- ── updated_at trigger (hergebruik bestaande tg_set_updated_at) ────────────────
do $$ begin
  perform 1 from pg_trigger where tgname = 'set_updated_at_debiteuren';
  if not found then
    create trigger set_updated_at_debiteuren
      before update on public.debiteuren
      for each row execute function public.tg_set_updated_at();
  end if;
end $$;

-- ── RLS-basislijn (zelfde patroon als 20260616c) ──────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['debiteuren','debiteur_logboek','debiteur_redencodes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists app_authenticated_all on public.%I', t);
    execute format(
      'create policy app_authenticated_all on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- ── Seed: 7 standaard redencodes ──────────────────────────────────────────────
insert into public.debiteur_redencodes (code, label, volgorde) values
  ('opleverpunten_open',         'Opleverpunten open',          1),
  ('meerwerkdiscussie',          'Meerwerkdiscussie',           2),
  ('klacht_schade',              'Klacht/schade',               3),
  ('administratieve_fout',       'Administratieve fout',        4),
  ('wachten_op_opdrachtgever',   'Wachten op opdrachtgever',    5),
  ('termijnstaat_niet_akkoord',  'Termijnstaat niet akkoord',   6),
  ('onbekend_escalatie',         'Onbekend/escalatie nodig',    7)
on conflict (code) do nothing;
