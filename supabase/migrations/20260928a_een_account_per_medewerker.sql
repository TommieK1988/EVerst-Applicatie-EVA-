-- Eén account per medewerker — sluitstuk in de database.
--
-- De uitnodigingsflow bewaakt dit al (lib/auth/account-regels.ts + verstuurUitnodiging), maar
-- `medewerkers.auth_user_id` werd ook gezet door /auth/callback en door de wachtwoord-login. Die
-- schrijven alleen als het veld nog leeg is, dus met de huidige code kan het niet misgaan; deze
-- index zorgt dat dat zo blijft als er ooit een vierde schrijver bij komt.
--
-- Bewust een UNIEKE INDEX op auth_user_id en NIET op e-mail: `medewerkers.email` komt uit de
-- Bouw7-sync, en die draait als bulk-upsert. Eén dubbele rij uit Bouw7 zou dan de hele
-- medewerkerssync laten klappen — en die faalt stil. Het adres wordt daarom in de
-- uitnodigingsactie gecontroleerd, waar een fout direct bij de beheerder op het scherm komt.
--
-- Gecontroleerd vóór aanmaken: geen enkele auth_user_id komt vaker dan één keer voor.

drop index if exists public.medewerkers_auth_user_idx;

create unique index if not exists medewerkers_auth_user_key
  on public.medewerkers (auth_user_id)
  where auth_user_id is not null;

comment on index public.medewerkers_auth_user_key is
  'Een auth-account hoort bij precies een medewerker. Zie lib/auth/account-regels.ts.';
