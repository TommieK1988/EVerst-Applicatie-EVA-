-- Gerben Neuteboom kon niet inloggen: twee auth-accounts, de verkeerde gekoppeld.
--
-- Op 1 september zijn binnen 40 seconden twee accounts ontstaan:
--   7d571c44…  azure, auth.users.email = gerben@evertsgroep.onmicrosoft.com
--   52fbfb51…  e-mail+wachtwoord, auth.users.email = gerben@everts.chat
--
-- Gerben logt in met Microsoft (7d571c44), maar de medewerkersrij hing aan
-- 52fbfb51. De auth-callback zoekt de medewerker op `medewerkers.email =
-- user.email`; dat werd dus het onmicrosoft-adres, gaf geen match, en de
-- callback logde hem meteen weer uit naar /login?fout=geen-toegang.
--
-- Zijn Azure-identiteit is inmiddels wél goed (auth.identities heeft email én
-- upn = gerben@everts.chat); alleen auth.users.email bleef op het adres van de
-- allereerste login staan, omdat gerben@everts.chat 40 seconden later al door
-- het wachtwoord-account geclaimd was. Supabase werkt dat niet uit zichzelf bij.
--
-- Deze migratie maakt het Microsoft-account leidend. Het wachtwoord-account
-- blijft bestaan onder een parkeeradres (niets wordt verwijderd, dus terug te
-- draaien); het matcht daarmee geen medewerkersrij meer en verleent dus geen
-- toegang.

do $$
declare
  v_azure  uuid := '7d571c44-e5ed-4b53-b6f8-cdc538614f2e';  -- Microsoft-login
  v_oud    uuid := '52fbfb51-9543-41fa-a415-96894b5738d4';  -- wachtwoord-account
  v_mail   text := 'gerben@everts.chat';
begin
  -- Beide accounts moeten nog zijn zoals verwacht; anders niets doen en klagen.
  if not exists (select 1 from auth.users where id = v_azure)
     or not exists (select 1 from auth.users where id = v_oud and email = v_mail) then
    raise exception 'Auth-accounts van Gerben zien er anders uit dan verwacht — migratie afgebroken';
  end if;

  -- 1. Adres vrijmaken. auth.users heeft een unique index op email
  --    (users_email_partial_key), dus dit moet vóór stap 2.
  update auth.users
     set email = 'gerben+oud-wachtwoordaccount@everts.chat',
         updated_at = now()
   where id = v_oud;

  -- 2. Het Microsoft-account krijgt het echte adres, zodat de auth-callback
  --    hem op medewerkers.email terugvindt.
  update auth.users
     set email = v_mail,
         email_confirmed_at = coalesce(email_confirmed_at, now()),
         updated_at = now()
   where id = v_azure;

  -- 3. Medewerkersrij naar het Microsoft-account. getCurrentMedewerker() zoekt
  --    op auth_user_id; zonder dit komt hij binnen zonder enig recht.
  update public.medewerkers
     set auth_user_id = v_azure,
         updated_at = now()
   where auth_user_id = v_oud;

  -- 4. Toegewezen taken meeverhuizen (task_assignees.user_id is een auth-user,
  --    geen medewerker-id). PK is (task_id, user_id); rijen die al op het
  --    nieuwe account staan overslaan, anders botst de update.
  update public.task_assignees ta
     set user_id = v_azure
   where ta.user_id = v_oud
     and not exists (
       select 1 from public.task_assignees b
        where b.task_id = ta.task_id and b.user_id = v_azure
     );
  delete from public.task_assignees where user_id = v_oud;
end $$;
