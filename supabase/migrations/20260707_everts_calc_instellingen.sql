-- EvertsCalc calculatie-instellingen naar Supabase (was localStorage evc_instellingen)
-- Eén globale configuratierij; de volledige Instellingen wordt als JSONB bewaard
-- (btw_tarieven, eenheden[{afkorting,omschrijving}], categorieen, categorieCodes,
--  kolom_namen, standaard_kostengroepen, uurtarieven).

create table if not exists public.everts_calc_instellingen (
  id            text        primary key default 'singleton',
  data          jsonb       not null default '{}'::jsonb,
  bijgewerkt_op timestamptz not null default now()
);

comment on table public.everts_calc_instellingen is
  'Globale EvertsCalc calculatie-instellingen (singleton). Vervangt localStorage-sleutel evc_instellingen.';

-- Zorg dat de singleton-rij bestaat
insert into public.everts_calc_instellingen (id, data)
values ('singleton', '{}'::jsonb)
on conflict (id) do nothing;

alter table public.everts_calc_instellingen enable row level security;

drop policy if exists "Auth read calc-instellingen" on public.everts_calc_instellingen;
create policy "Auth read calc-instellingen"
  on public.everts_calc_instellingen for select to authenticated using (true);

drop policy if exists "Auth write calc-instellingen" on public.everts_calc_instellingen;
create policy "Auth write calc-instellingen"
  on public.everts_calc_instellingen for all to authenticated using (true) with check (true);
