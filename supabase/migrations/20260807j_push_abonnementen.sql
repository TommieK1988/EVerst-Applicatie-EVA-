-- Pushmeldingen: abonnementen per gebruiker/apparaat.
--
-- Eén rij = één browser/telefoon die toestemming heeft gegeven. Een gebruiker kan
-- er dus meerdere hebben (telefoon + laptop). Het endpoint is de sleutel die de
-- pushdienst van de browser (FCM/APNs/Mozilla) uitgeeft en is uniek per apparaat,
-- dus dat is meteen de natuurlijke unieke sleutel: opnieuw aanmelden op hetzelfde
-- toestel overschrijft de bestaande rij in plaats van er een tweede bij te maken.
--
-- Geen RLS-policies: net als de andere gevoelige tabellen is deze alleen via de
-- service-role bereikbaar (de API-routes doen zelf de eigenaarscontrole).

create table if not exists public.push_abonnementen (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  endpoint        text not null,
  p256dh          text not null,
  auth            text not null,
  user_agent      text,
  aangemaakt_op   timestamptz not null default now(),
  laatst_gebruikt timestamptz,
  constraint push_abonnementen_endpoint_uniek unique (endpoint)
);

create index if not exists push_abonnementen_user_idx
  on public.push_abonnementen (user_id);

alter table public.push_abonnementen enable row level security;

comment on table public.push_abonnementen is
  'Web-push abonnementen (VAPID) per gebruiker en apparaat; gevuld vanuit /api/push/aanmelden.';
