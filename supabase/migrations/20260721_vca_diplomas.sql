-- =====================================================================
-- VCA-diplomaregister — per medewerker soort, nummer en geldigheid
-- =====================================================================
-- Tot nu toe werd een VCA-diploma alleen als bestand bij de medewerker
-- geüpload (medewerker_bestanden, categorie 'vca_diploma'). Daarmee is niet
-- te zien wanneer een diploma verloopt. Deze tabel legt dat wél vast, zodat
-- KAM kan sturen op bijna-verlopen diploma's en het bij een audit aantoonbaar is.
--
-- Meerdere rijen per medewerker zijn toegestaan (herhaling/verlenging blijft
-- als historie staan); overzichten tonen de rij met de laatste geldig_tot.

create table if not exists public.vca_diplomas (
  id             uuid primary key default gen_random_uuid(),
  medewerker_id  uuid not null references public.medewerkers(id) on delete cascade,
  soort          text not null default 'b_vca'
                   check (soort in ('b_vca','vol_vca','vil_vca')),
  diplomanummer  text,
  behaald_op     date,
  geldig_tot     date,
  -- Optionele koppeling naar de geüploade scan bij de medewerker.
  bestand_id     uuid references public.medewerker_bestanden(id) on delete set null,
  opmerking      text,
  aangemaakt_door uuid references auth.users(id) on delete set null,
  aangemaakt_op  timestamptz not null default now(),
  bijgewerkt_op  timestamptz not null default now()
);
comment on table public.vca_diplomas is
  'VCA-diploma per medewerker met soort en geldigheidsdatum; basis voor het KAM-overzicht en verloopsignalering.';
comment on column public.vca_diplomas.soort is
  'b_vca = Basisveiligheid VCA, vol_vca = VOL-VCA (leidinggevenden), vil_vca = VIL-VCA (intercedenten).';

create index if not exists vca_diplomas_medewerker_idx on public.vca_diplomas(medewerker_id);
create index if not exists vca_diplomas_geldig_tot_idx on public.vca_diplomas(geldig_tot);

create trigger vca_diplomas_bijgewerkt
  before update on public.vca_diplomas
  for each row execute function public.set_bijgewerkt_op();

alter table public.vca_diplomas enable row level security;
drop policy if exists app_authenticated_all on public.vca_diplomas;
create policy app_authenticated_all on public.vca_diplomas
  for all to authenticated using (true) with check (true);
