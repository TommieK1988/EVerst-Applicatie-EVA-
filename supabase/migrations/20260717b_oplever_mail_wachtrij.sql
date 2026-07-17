-- Oplevering — mail-wachtrij.
--
-- Waarom een wachtrij: EVA verstuurt mail via Graph `/me/sendMail`, dus namens een ingelogde
-- medewerker met een geldig O365-token. Een cron heeft géén ingelogde gebruiker en kan dus niet
-- zelf versturen. De cron (herinneringen aan onderaannemers, feedback-uitnodigingen) zet daarom
-- alleen berichten kláár; ze gaan pas de deur uit wanneer een medewerker is ingelogd en de
-- wachtrij verstuurt. Dat maakt het verzenden bovendien een bewuste handeling i.p.v. een
-- verrassing op de achtergrond.

create table if not exists public.oplever_mail_wachtrij (
  id             uuid primary key default gen_random_uuid(),
  dossier_id     uuid not null references public.dossiers(id) on delete cascade,
  soort          text not null
                   check (soort in ('rapportage','herinnering','feedback_uitnodiging')),
  ontvangers     text[] not null default '{}',
  cc             text[] not null default '{}',
  onderwerp      text not null,
  body_html      text not null,
  status         text not null default 'wachtend'
                   check (status in ('wachtend','verzonden','mislukt','geannuleerd')),
  -- Herkomst/ontdubbeling: per (dossier, soort, sleutel) staat er hooguit één bericht te wachten.
  sleutel        text,
  moment_id      uuid references public.oplever_momenten(id) on delete cascade,
  relatie_id     uuid references public.relaties(id) on delete set null,
  pogingen       int  not null default 0,
  laatste_fout   text,
  verzonden_op   timestamptz,
  verzonden_door uuid references public.medewerkers(id) on delete set null,
  created_at     timestamptz not null default now()
);

create index if not exists idx_oplever_mail_dossier on public.oplever_mail_wachtrij(dossier_id);
create index if not exists idx_oplever_mail_status  on public.oplever_mail_wachtrij(status);

-- Eén wachtend bericht per (dossier, soort, sleutel): de cron mag elke dag draaien zonder
-- dubbele herinneringen te stapelen.
create unique index if not exists uq_oplever_mail_wachtend
  on public.oplever_mail_wachtrij(dossier_id, soort, sleutel)
  where status = 'wachtend' and sleutel is not null;

comment on table public.oplever_mail_wachtrij is
  'Klaargezette opleveringsmails (rapportage/herinnering/feedback). Cron vult de wachtrij; versturen gebeurt via Graph namens een ingelogde medewerker.';

alter table public.oplever_mail_wachtrij enable row level security;
drop policy if exists app_authenticated_all on public.oplever_mail_wachtrij;
create policy app_authenticated_all on public.oplever_mail_wachtrij
  for all to authenticated using (true) with check (true);
