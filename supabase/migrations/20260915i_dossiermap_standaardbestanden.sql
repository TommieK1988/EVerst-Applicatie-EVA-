-- Voorbeeldbestanden die EVA direct in een nieuwe dossiermap zet.
--
-- De bestanden staan in EVA (privé bucket) en niet in SharePoint: zo hangt een regel niet
-- aan een map die iemand kan verplaatsen of hernoemen, en is "vervang dit voorbeeld" één
-- upload in de instellingen.
--
-- Filters zijn arrays met "leeg = geldt voor alles", net als bij de documentsjablonen.
-- Categorie op Bouw7-id en niet op naam: de namen komen uit Bouw7 en kunnen daar hernoemd
-- worden, waarna een filter op naam stil zou stoppen met werken.

create table if not exists public.dossiermap_standaardbestanden (
  id                   uuid primary key default gen_random_uuid(),
  naam                 text not null default '',
  bestandsnaam         text not null,
  -- null = direct in de dossiermap (de standaard). Eén niveau diep; geen padscheidingstekens.
  submap               text,
  storage_path         text not null,
  content_type         text,
  grootte              bigint,
  categorie_ids        integer[] not null default '{}',
  werkmaatschappij_ids uuid[]    not null default '{}',
  actief               boolean not null default true,
  volgorde             integer not null default 0,
  aangemaakt_door      uuid references auth.users(id) on delete set null,
  aangemaakt_op        timestamptz not null default now(),
  bijgewerkt_op        timestamptz not null default now(),
  constraint dossiermap_standaardbestanden_submap_plat
    check (submap is null or (submap !~ '[\\/]' and length(btrim(submap)) > 0))
);

comment on table public.dossiermap_standaardbestanden is
  'Bestanden die EVA direct in een nieuw aangemaakte SharePoint-dossiermap plaatst. Beheerd via Instellingen > Dossiermap. Alleen bij het AANMAKEN van de map - een bestaande map wordt nooit achteraf aangevuld.';
comment on column public.dossiermap_standaardbestanden.bestandsnaam is
  'De naam die het bestand in de dossiermap krijgt.';
comment on column public.dossiermap_standaardbestanden.submap is
  'Submap binnen de dossiermap. Leeg is de standaard: het bestand komt direct in de dossiermap.';
comment on column public.dossiermap_standaardbestanden.categorie_ids is
  'Bouw7-categorie-ids waarvoor deze regel geldt; leeg = alle categorieen. Match op dossiers.bouw7_categorie_id.';
comment on column public.dossiermap_standaardbestanden.werkmaatschappij_ids is
  'bedrijfsgegevens-ids waarvoor deze regel geldt; leeg = alle. Bewust een array zonder foreign key: een regel geldt meestal voor meerdere werkmaatschappijen.';

create index if not exists dossiermap_standaardbestanden_actief_idx
  on public.dossiermap_standaardbestanden (actief, volgorde);

drop trigger if exists dossiermap_standaardbestanden_bijgewerkt on public.dossiermap_standaardbestanden;
create trigger dossiermap_standaardbestanden_bijgewerkt
  before update on public.dossiermap_standaardbestanden
  for each row execute function public.set_bijgewerkt_op();

-- RLS: lezen mag elke platformgebruiker; muteren gaat via de service-role achter
-- vereisBeheerder(). `authenticated` omvat sinds het klantportaal ook opdrachtgevers,
-- vandaar de is_platform_gebruiker()-poort.
alter table public.dossiermap_standaardbestanden enable row level security;
drop policy if exists platform_gebruikers_all on public.dossiermap_standaardbestanden;
create policy platform_gebruikers_all on public.dossiermap_standaardbestanden
  for all to authenticated
  using (public.is_platform_gebruiker()) with check (public.is_platform_gebruiker());

-- Privé bucket. Geen allowed_mime_types: een voorbeeld mag net zo goed een .xlsx, .dwg of
-- .msg zijn. De groottegrens (20 MB) volstaat als rem.
insert into storage.buckets (id, name, public, file_size_limit)
values ('dossiermap-bestanden', 'dossiermap-bestanden', false, 20971520)
on conflict (id) do nothing;

-- De app leest en schrijft met de service-role, die deze policies bypasst. Ze staan er
-- zodat een anon- of klantsessie er niet zelf bij kan.
do $buckets$
begin
  if not exists (select 1 from pg_policies where policyname = 'Dossiermapbestanden lezen' and tablename = 'objects') then
    create policy "Dossiermapbestanden lezen"
      on storage.objects for select to authenticated
      using (bucket_id = 'dossiermap-bestanden' and public.is_platform_gebruiker());
  end if;
  if not exists (select 1 from pg_policies where policyname = 'Dossiermapbestanden uploaden' and tablename = 'objects') then
    create policy "Dossiermapbestanden uploaden"
      on storage.objects for insert to authenticated
      with check (bucket_id = 'dossiermap-bestanden' and public.is_platform_gebruiker());
  end if;
  if not exists (select 1 from pg_policies where policyname = 'Dossiermapbestanden verwijderen' and tablename = 'objects') then
    create policy "Dossiermapbestanden verwijderen"
      on storage.objects for delete to authenticated
      using (bucket_id = 'dossiermap-bestanden' and public.is_platform_gebruiker());
  end if;
end $buckets$;
