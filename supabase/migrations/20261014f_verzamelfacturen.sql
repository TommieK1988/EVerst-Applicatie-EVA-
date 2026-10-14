-- Verzamelfacturen: één Bouw7-factuur voor meerdere servicedeskbonnen van dezelfde factuurpartij.
--
-- Bouw7 kent dit zelf (`InvoiceDocument.isCollective`): de factuur hangt aan geen enkel project,
-- elk project krijgt een eigen hoofdstuk en elke regel draagt zijn `projectId`. Daardoor vindt
-- `/list/invoices?q=project.id = X` zo'n factuur níét terug. EVA onthoudt de koppeling dus zelf:
-- welke bonnen op welke verzamelfactuur staan, en of die al verstuurd is.
--
-- De regels zelf staan hier niet. Die volgen uit de bonnen (regie: `regie_factuurregels` met
-- `bouw7_invoice_id`; aangenomen: de termijnen in Bouw7) — net als bij een factuur per bon.

create table if not exists public.verzamelfacturen (
  id                  uuid primary key default gen_random_uuid(),
  werkmaatschappij_id uuid references public.bedrijfsgegevens(id) on delete restrict,
  -- De factuurpartij: het Bouw7-contact waar de factuur op staat.
  bouw7_contact_id    text not null,
  factuurpartij_naam  text not null,
  omschrijving        text,
  bouw7_invoice_id    text,
  -- concept: klaargezet in Bouw7, nog zonder nummer · verzonden: Bouw7 gaf een factuurnummer ·
  -- verwijderd: het concept is in Bouw7 weggegooid (de boekingen zijn dan weer vrij).
  status              text not null default 'concept'
                      check (status in ('concept', 'verzonden', 'verwijderd')),
  factuurnummer       text,
  totaal_excl_btw     numeric(12,2),
  aangemaakt_door     uuid references public.medewerkers(id) on delete set null,
  aangemaakt_op       timestamptz not null default now(),
  verzonden_op        timestamptz,
  gecontroleerd_op    timestamptz
);

create index if not exists verzamelfacturen_status_idx on public.verzamelfacturen (status);

create table if not exists public.verzamelfactuur_dossiers (
  verzamelfactuur_id  uuid not null references public.verzamelfacturen(id) on delete cascade,
  dossier_id          uuid not null references public.dossiers(id) on delete restrict,
  bedrag_excl_btw     numeric(12,2) not null default 0,
  primary key (verzamelfactuur_id, dossier_id)
);

create index if not exists verzamelfactuur_dossiers_dossier_idx on public.verzamelfactuur_dossiers (dossier_id);

-- Alleen via server actions (admin-client, met rechtencontrole). Geen policies = geen directe toegang.
alter table public.verzamelfacturen enable row level security;
alter table public.verzamelfactuur_dossiers enable row level security;

comment on table public.verzamelfacturen is
  'Verzamelfacturen die EVA in Bouw7 klaarzet (isCollective). Bouw7 koppelt ze aan geen project, dus EVA bewaart welke bonnen erop staan.';
