-- Houtrot: ook app-gebruikers (timmermannen, schilders, teamleiders) mogen registreren.
-- De cutover (20260721_houtrot_cutover_medewerkers) gaf alle houtrot-tabellen alleen
-- toegang voor platformgebruikers. De Houtrot-tab in EVA Mobiel schrijft met de
-- browser-client, dus elke registratie van een vakman liep stuk op
-- "new row violates row-level security policy".
--
-- Verruimd wordt alleen wat de app zelf aanraakt: registraties, hun werkzaamheden,
-- foto's en het activiteitenlog (+ de foto-bucket). Bibliotheek en de oude
-- houtrot-projecten blijven kantoorwerk.

create or replace function public.is_app_gebruiker()
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.medewerkers
    where auth_user_id = auth.uid()
      and gebruiker_type = 'app_gebruiker'
      and actief = true
  );
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'repair_registrations','repair_registration_lines','repair_photos','activity_logs'
  ]
  loop
    execute format('drop policy if exists app_gebruiker_toegang on houtrotherstel.%I', t);
    execute format(
      'create policy app_gebruiker_toegang on houtrotherstel.%I for all to authenticated '
      || 'using ((select public.is_app_gebruiker())) with check ((select public.is_app_gebruiker()))', t);
  end loop;
end $$;

drop policy if exists "Repair-photos uploaden (app)" on storage.objects;
create policy "Repair-photos uploaden (app)" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'repair-photos' and (select public.is_app_gebruiker()));

drop policy if exists "Repair-photos verwijderen (app)" on storage.objects;
create policy "Repair-photos verwijderen (app)" on storage.objects
  for delete to authenticated
  using (bucket_id = 'repair-photos' and (select public.is_app_gebruiker()));

drop policy if exists "Repair-photos lezen (app)" on storage.objects;
create policy "Repair-photos lezen (app)" on storage.objects
  for select to authenticated
  using (bucket_id = 'repair-photos' and (select public.is_app_gebruiker()));
