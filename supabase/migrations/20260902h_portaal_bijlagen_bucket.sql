-- Private bucket voor chatbijlagen uit het klantportaal.
-- Toegepast op 2026-09-02 via de Supabase MCP.
--
-- Afwijkend van oplever-fotos en kwaliteit-fotos, die publiek zijn: dit is
-- correspondentie tussen ons en één opdrachtgever. Die hoort niet op een
-- raadbare publieke URL te staan. De klant komt er alleen bij via
-- /api/portaal/bijlage, dat na de guard een kortlopende signed URL afgeeft.
--
-- 8 MB per bestand — dezelfde grens die het tokenportaal onder /p/ hanteert
-- voor publieke uploads, en ruim genoeg voor een telefoonfoto.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'portaal-bijlagen', 'portaal-bijlagen', false, 8388608,
  array[
    'image/jpeg','image/jpg','image/png','image/webp','image/heic','image/heif',
    'application/pdf'
  ]
)
on conflict (id) do nothing;

-- De app leest en schrijft via de service-role client, die deze policies
-- bypasst. Ze staan er zodat een anon- of klantsessie er niet zelf bij kan:
-- een portaalgebruiker is authenticated maar geen platformgebruiker.
do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Portaalbijlagen lezen' and tablename = 'objects') then
    create policy "Portaalbijlagen lezen"
      on storage.objects for select to authenticated
      using (bucket_id = 'portaal-bijlagen' and is_platform_gebruiker());
  end if;
  if not exists (select 1 from pg_policies where policyname = 'Portaalbijlagen uploaden' and tablename = 'objects') then
    create policy "Portaalbijlagen uploaden"
      on storage.objects for insert to authenticated
      with check (bucket_id = 'portaal-bijlagen' and is_platform_gebruiker());
  end if;
  if not exists (select 1 from pg_policies where policyname = 'Portaalbijlagen verwijderen' and tablename = 'objects') then
    create policy "Portaalbijlagen verwijderen"
      on storage.objects for delete to authenticated
      using (bucket_id = 'portaal-bijlagen' and is_platform_gebruiker());
  end if;
end $$;
