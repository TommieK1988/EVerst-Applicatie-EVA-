-- Meerdere e-mailadressen per contactpersoon.
--
-- Tot nu toe had een contactpersoon precies één werkadres (`contactpersonen.email`) en één
-- privéadres. In de praktijk heeft iemand er vaak meer: een persoonlijk adres én het
-- facturenpostbus van zijn kantoor, of een oud en een nieuw adres tijdens een overgang.
--
-- `contactpersonen.email` blijft het PRIMAIRE adres en blijft de waarheid voor de rest van EVA:
-- Bouw7 kent maar één adres per contactpersoon, en tientallen plekken lezen die kolom. Deze
-- tabel houdt de volledige lijst bij, inclusief een spiegel van dat primaire adres, zodat de
-- ontvangerkiezer alle adressen kan aanbieden zonder dat bestaande code hoeft te veranderen.
--
-- `herkomst` onderscheidt de spiegelrij van handmatig toegevoegde adressen. Zonder dat verschil
-- zou elke wijziging van het primaire adres een wees achterlaten in de lijst.

create table if not exists public.contactpersoon_emails (
  id                uuid primary key default gen_random_uuid(),
  contactpersoon_id uuid not null references public.contactpersonen(id) on delete cascade,
  email             text not null check (position('@' in email) > 1),
  -- Vrije aanduiding: Werk, Privé, Facturen, Oud adres…
  label             text,
  -- Precies één per persoon; spiegelt `contactpersonen.email`.
  is_primair        boolean not null default false,
  -- 'primair' = door de trigger gespiegeld, 'handmatig' = door een gebruiker toegevoegd.
  herkomst          text not null default 'handmatig' check (herkomst in ('primair', 'handmatig')),
  opmerking         text,
  created_at        timestamptz not null default now(),
  created_by        uuid
);

comment on table public.contactpersoon_emails is
  'Alle e-mailadressen van een contactpersoon. Het primaire adres staat óók in contactpersonen.email; die kolom blijft leidend voor Bouw7 en voor bestaande code.';

-- Eén keer hetzelfde adres per persoon, hoofdletterongevoelig.
create unique index if not exists contactpersoon_emails_uniek
  on public.contactpersoon_emails (contactpersoon_id, lower(email));

-- Hooguit één primair adres per persoon.
create unique index if not exists contactpersoon_emails_een_primair
  on public.contactpersoon_emails (contactpersoon_id) where is_primair;

create index if not exists contactpersoon_emails_adres_idx
  on public.contactpersoon_emails (lower(email));

/*
 * Spiegel `contactpersonen.email` naar de lijst.
 *
 * Draait bij insert en bij elke wijziging van het adres — dus ook wanneer de Bouw7-sync het
 * adres bijwerkt. Bestaat het nieuwe adres al als handmatige rij, dan wordt díé rij het
 * primaire adres in plaats van dat er een dubbele bijkomt.
 */
create or replace function public.contactpersoon_email_spiegelen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Oude spiegelrij opruimen: die hoort bij een adres dat niet meer het primaire is.
  delete from public.contactpersoon_emails
   where contactpersoon_id = new.id and herkomst = 'primair'
     and (new.email is null or lower(email) is distinct from lower(new.email));

  if new.email is null or position('@' in new.email) < 2 then
    return new;
  end if;

  -- Alles ontprimairen wat het niet (meer) is; anders botst de unieke index.
  update public.contactpersoon_emails
     set is_primair = false
   where contactpersoon_id = new.id and is_primair
     and lower(email) is distinct from lower(new.email);

  insert into public.contactpersoon_emails (contactpersoon_id, email, is_primair, herkomst)
  values (new.id, new.email, true, 'primair')
  on conflict (contactpersoon_id, lower(email))
  -- Bestond het adres al als handmatige rij: die wordt nu het primaire, maar behoudt zijn
  -- label en herkomst zodat de gebruiker zijn eigen aanduiding niet kwijtraakt.
  do update set is_primair = true;

  return new;
end;
$$;

drop trigger if exists contactpersoon_email_spiegel on public.contactpersonen;
create trigger contactpersoon_email_spiegel
  after insert or update of email on public.contactpersonen
  for each row execute function public.contactpersoon_email_spiegelen();

-- ── Backfill ────────────────────────────────────────────────────────────────
-- 1. Het huidige werkadres als primaire rij.
insert into public.contactpersoon_emails (contactpersoon_id, email, is_primair, herkomst)
select id, email, true, 'primair'
  from public.contactpersonen
 where email is not null and position('@' in email) > 1
on conflict do nothing;

-- 2. Het privéadres, waar dat een ánder adres is.
insert into public.contactpersoon_emails (contactpersoon_id, email, label, is_primair, herkomst)
select id, prive_email, 'Privé', false, 'handmatig'
  from public.contactpersonen
 where prive_email is not null and position('@' in prive_email) > 1
   and lower(prive_email) is distinct from lower(coalesce(email, ''))
on conflict do nothing;

-- 3. Adressen die per werkgever afwijken (Bouw7 zet die op de koppeling).
insert into public.contactpersoon_emails (contactpersoon_id, email, label, is_primair, herkomst)
select distinct on (o.contactpersoon_id, lower(o.email))
       o.contactpersoon_id, o.email, r.naam, false, 'handmatig'
  from public.contactpersoon_organisaties o
  join public.relaties r on r.id = o.organisatie_id
  join public.contactpersonen c on c.id = o.contactpersoon_id
 where o.email is not null and position('@' in o.email) > 1
   and lower(o.email) is distinct from lower(coalesce(c.email, ''))
on conflict do nothing;

alter table public.contactpersoon_emails enable row level security;
