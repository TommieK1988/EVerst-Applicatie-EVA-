-- Houtrot: meerdere werkzaamheden per reparatie-registratie.
--
-- Een registratie (repair_registrations) was tot nu toe gekoppeld aan precies één
-- recept (recept_id). In de praktijk bestaat één reparatie uit meerdere
-- werkzaamheden, elk met een aantal (bv. 1x onderdorpel vervangen + 1x beplating
-- de/hermonteren + 4x glaslat). Deze tabel legt die regels vast; het
-- reparatietotaal is de som van de regels. Prijzen zijn een momentopname zodat
-- latere recept-/tariefwijzigingen bestaande registraties niet raken.
--
-- Toegepast op 2026-07-28 via de Supabase MCP (er waren nul registraties).

create table if not exists houtrotherstel.repair_registration_lines (
  id               uuid primary key default gen_random_uuid(),
  registration_id  uuid not null
                     references houtrotherstel.repair_registrations(id) on delete cascade,
  -- Recept uit de calculatiebibliotheek (public.paint_items). Nullable: het recept
  -- mag later opgeruimd worden zonder de historische regel te verliezen.
  recept_id        uuid references public.paint_items(id) on delete set null,
  aantal           numeric(10,2) not null default 1 check (aantal > 0),
  -- Momentopname per stuk
  repair_code_snapshot        text,
  repair_name_snapshot        text,
  repair_description_snapshot text,
  unit_snapshot               text,
  labor_hours_snapshot        numeric(10,2),
  labor_rate_snapshot         numeric(10,2),
  cost_price_snapshot         numeric(12,2),
  sale_price_snapshot         numeric(12,2),
  -- Regeltotalen: automatisch, nooit zelf schrijven.
  line_cost_total  numeric(14,2) generated always as (aantal * coalesce(cost_price_snapshot, 0)) stored,
  line_sale_total  numeric(14,2) generated always as (aantal * coalesce(sale_price_snapshot, 0)) stored,
  volgorde         int not null default 0,
  created_at       timestamptz not null default now()
);

create index if not exists idx_htr_rrl_registration
  on houtrotherstel.repair_registration_lines(registration_id);

-- RLS + rechten: exact de lijn van de andere houtrot-tabellen.
alter table houtrotherstel.repair_registration_lines enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'houtrotherstel'
      and tablename  = 'repair_registration_lines'
      and policyname = 'platform_gebruiker_toegang'
  ) then
    create policy platform_gebruiker_toegang
      on houtrotherstel.repair_registration_lines
      for all to authenticated
      using (is_platform_gebruiker())
      with check (is_platform_gebruiker());
  end if;
end $$;

grant all on houtrotherstel.repair_registration_lines to anon, authenticated, service_role;

-- ── Storage-bucket voor voor/na-foto's ────────────────────────────────────────
-- De mobiele client uploadt rechtstreeks en leest via getPublicUrl → publieke
-- bucket (zelfde lijn als oplever-fotos). Schrijven/verwijderen alleen voor
-- echte platform-gebruikers.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'repair-photos', 'repair-photos', true, 26214400,
  array['image/jpeg','image/jpg','image/png','image/webp','image/heic','image/heif']
)
on conflict (id) do nothing;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Repair-photos lezen' and tablename = 'objects') then
    create policy "Repair-photos lezen"
      on storage.objects for select to authenticated
      using (bucket_id = 'repair-photos' and is_platform_gebruiker());
  end if;
  if not exists (select 1 from pg_policies where policyname = 'Repair-photos uploaden' and tablename = 'objects') then
    create policy "Repair-photos uploaden"
      on storage.objects for insert to authenticated
      with check (bucket_id = 'repair-photos' and is_platform_gebruiker());
  end if;
  if not exists (select 1 from pg_policies where policyname = 'Repair-photos verwijderen' and tablename = 'objects') then
    create policy "Repair-photos verwijderen"
      on storage.objects for delete to authenticated
      using (bucket_id = 'repair-photos' and is_platform_gebruiker());
  end if;
end $$;

-- PostgREST-schemacache verversen zodat de nieuwe tabel + embed direct werken.
notify pgrst, 'reload schema';
