-- =====================================================================
-- Huisstijl-uitbreiding + multi-werkmaatschappij ondersteuning
-- =====================================================================
-- Maakt bedrijfsgegevens geschikt voor meerdere werkmaatschappijen
-- met elk eigen huisstijl (logo's, kleuren, fonts).
--
-- Structuur: Organisatie (parent) → Werkmaatschappij (child)
-- Elke werkmaatschappij heeft eigen bedrijfsgegevens + huisstijl.
-- =====================================================================

-- ── 1. Multi-werkmaatschappij kolommen ──────────────────────────────
create type bedrijf_type as enum ('organisatie', 'werkmaatschappij');

alter table public.bedrijfsgegevens
  add column if not exists type         bedrijf_type not null default 'organisatie',
  add column if not exists parent_id    uuid references public.bedrijfsgegevens(id) on delete set null,
  add column if not exists code         text;   -- korte interne code (bv. "EOS", "BM")

-- Constraint: organisatie mag geen parent hebben, werkmaatschappij moet parent hebben
alter table public.bedrijfsgegevens
  add constraint bedrijf_parent_check check (
    (type = 'organisatie'      and parent_id is null) or
    (type = 'werkmaatschappij' and parent_id is not null)
  );

create index if not exists bedrijfsgegevens_parent_idx on public.bedrijfsgegevens (parent_id) where parent_id is not null;
create index if not exists bedrijfsgegevens_type_idx   on public.bedrijfsgegevens (type);

-- ── 2. Logo's (URLs naar Supabase Storage brand-assets bucket) ──────
alter table public.bedrijfsgegevens
  add column if not exists logo_primair_url   text,   -- hoofdlogo kleur
  add column if not exists logo_wit_url       text,   -- wit/negatief versie
  add column if not exists logo_icon_url      text,   -- icoon/beeldmerk (vierkant)
  add column if not exists logo_monochroom_url text;  -- zwart-wit versie

-- ── 3. Kleuren (uitbreiding van bestaande kleur_primair + kleur_accent)
alter table public.bedrijfsgegevens
  add column if not exists kleur_secundair    text,   -- subtielere elementen
  add column if not exists kleur_succes       text default '#16a34a',
  add column if not exists kleur_waarschuwing text default '#eab308',
  add column if not exists kleur_fout         text default '#dc2626',
  add column if not exists kleur_tekst        text default '#0f172a',
  add column if not exists kleur_achtergrond  text default '#f8fafc';

-- ── 4. Typografie ───────────────────────────────────────────────────
alter table public.bedrijfsgegevens
  add column if not exists font_primair       text default 'Montserrat',
  add column if not exists font_secundair     text;   -- null = zelfde als primair

-- ── 5. Notities ─────────────────────────────────────────────────────
alter table public.bedrijfsgegevens
  add column if not exists huisstijl_notities text;   -- vrij tekstveld voor huisstijlregels

-- ── 6. Markeer bestaande rij als organisatie ────────────────────────
-- Als er al een rij is (uit vorige sessie), zet die op type='organisatie'.
update public.bedrijfsgegevens set type = 'organisatie' where parent_id is null;

-- ── 7. Supabase Storage: brand-assets bucket ────────────────────────
insert into storage.buckets (id, name, public)
values ('brand-assets', 'brand-assets', true)
on conflict (id) do nothing;

-- Publiek leesbaar
do $$ begin
  if not exists (
    select 1 from pg_policies where policyname = 'Brand assets publiek leesbaar' and tablename = 'objects'
  ) then
    create policy "Brand assets publiek leesbaar"
      on storage.objects for select
      using (bucket_id = 'brand-assets');
  end if;
end $$;

-- Upload voor geauthenticeerde users
do $$ begin
  if not exists (
    select 1 from pg_policies where policyname = 'Brand assets upload voor auth users' and tablename = 'objects'
  ) then
    create policy "Brand assets upload voor auth users"
      on storage.objects for insert
      with check (bucket_id = 'brand-assets' and auth.role() = 'authenticated');
  end if;
end $$;

-- Verwijderen voor geauthenticeerde users
do $$ begin
  if not exists (
    select 1 from pg_policies where policyname = 'Brand assets verwijderen voor auth users' and tablename = 'objects'
  ) then
    create policy "Brand assets verwijderen voor auth users"
      on storage.objects for delete
      using (bucket_id = 'brand-assets' and auth.role() = 'authenticated');
  end if;
end $$;
