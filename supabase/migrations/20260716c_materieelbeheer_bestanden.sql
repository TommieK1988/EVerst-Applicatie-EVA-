-- Materieelbeheer — foto's en documenten per object
--
-- Bucket is PRIVÉ: er komen niet alleen foto's in, maar ook facturen, CE- en
-- keuringsdocumenten. Dat volgt de lijn van dossier-bestanden/medewerker-
-- bestanden (privé), niet die van oplever-fotos (publiek). Inzien gebeurt via
-- kortstondige signed URLs, server-side gegenereerd.
--
-- Omdat de bucket privé is, slaan we het STORAGE-PAD op i.p.v. een URL: een
-- URL zou verlopen en dus waardeloos zijn in de database. Vandaar de hernoemde
-- kolommen (beide tabellen zijn nog leeg, dus dat kan zonder datamigratie).

-- 1) Bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'materieel-bestanden', 'materieel-bestanden', false, 52428800,
  array[
    'image/jpeg','image/jpg','image/png','image/webp','image/heic','image/heif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do nothing;

-- 2) Storage-policies — alleen echte platform-gebruikers.
--    De app leest/schrijft via de service-role client (die bypasst dit), maar
--    zonder deze policies zou een anon-key wél bij de bestanden kunnen.
do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Materieel-bestanden lezen' and tablename = 'objects') then
    create policy "Materieel-bestanden lezen"
      on storage.objects for select to authenticated
      using (bucket_id = 'materieel-bestanden' and is_platform_gebruiker());
  end if;
  if not exists (select 1 from pg_policies where policyname = 'Materieel-bestanden uploaden' and tablename = 'objects') then
    create policy "Materieel-bestanden uploaden"
      on storage.objects for insert to authenticated
      with check (bucket_id = 'materieel-bestanden' and is_platform_gebruiker());
  end if;
  if not exists (select 1 from pg_policies where policyname = 'Materieel-bestanden verwijderen' and tablename = 'objects') then
    create policy "Materieel-bestanden verwijderen"
      on storage.objects for delete to authenticated
      using (bucket_id = 'materieel-bestanden' and is_platform_gebruiker());
  end if;
end $$;

-- 3) Kolommen: pad i.p.v. URL (bucket is privé)
do $$ begin
  if exists (select 1 from information_schema.columns
             where table_name = 'materieel_documenten' and column_name = 'url') then
    alter table public.materieel_documenten rename column url to storage_path;
  end if;
  if exists (select 1 from information_schema.columns
             where table_name = 'materieel_objecten' and column_name = 'hoofdfoto_url') then
    alter table public.materieel_objecten rename column hoofdfoto_url to hoofdfoto_path;
  end if;
end $$;

alter table public.materieel_documenten
  add column if not exists grootte bigint,
  add column if not exists mimetype text;

comment on column public.materieel_documenten.storage_path is
  'Pad in de private bucket materieel-bestanden; inzien via signed URL.';
comment on column public.materieel_objecten.hoofdfoto_path is
  'Storage-pad van de hoofdfoto (bucket materieel-bestanden).';
