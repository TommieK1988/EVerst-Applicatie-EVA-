-- Bouw7-offertes als rijen, in plaats van alleen als aggregaat op het dossier.
--
-- WAAROM: de sync haalt via /list/quotations al álle offertes op, maar reduceert ze meteen tot
-- één offerte per project (de meest recente) plus een telling van de verstuurde. Alles daarbuiten
-- wordt weggegooid. Daardoor kon EVA niet tonen wélke offerte openstaat wanneer er meerdere onder
-- één project hangen — precies de situatie waarin commerciële opvolging het meest misgaat.
--
-- Dit is een SPIEGEL van Bouw7, geen eigen administratie: EVA schrijft hier niets anders in dan
-- wat de sync leest, en niets uit deze tabel gaat terug naar Bouw7. Het dossier-aggregaat
-- (offerte_verstuurd_aantal / _som_excl_btw) blijft bestaan en ongemoeid; borden en kaarten
-- blijven daarop rekenen.
--
-- Let op bij lezen: `datum` is de offertedatum uit Bouw7 (quotationDate). Die is betrouwbaarder
-- voor "hoeveel dagen staat deze offerte open" dan `dossiers.verzonden_op`, want dat laatste is
-- het moment waarop EVA de fasewissel zag, niet het moment waarop de offerte de deur uit ging.

create table if not exists public.bouw7_offertes (
  id                  uuid        primary key default gen_random_uuid(),

  -- Bouw7-bron (door de sync gevuld, nooit door een gebruiker bewerkt)
  bouw7_quotation_id  text        not null,
  bouw7_project_id    text,
  nummer              text,
  onderwerp           text,
  referentie          text,
  datum               date,
  status              text,        -- quotationStatus.name, bv. "03. Verstuurd"
  subtotaal_excl_btw  numeric,
  totaal_incl_btw     numeric,
  calculator_naam     text,

  -- Koppeling naar EVA. Null zolang het bijbehorende project nog geen dossier heeft.
  dossier_id          uuid        references public.dossiers(id) on delete cascade,

  synced_op           timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- De sleutel waarop de sync ge-upsert: één rij per Bouw7-offerte.
create unique index if not exists bouw7_offertes_quotation_uniek
  on public.bouw7_offertes (bouw7_quotation_id);

create index if not exists bouw7_offertes_dossier_idx
  on public.bouw7_offertes (dossier_id, datum desc) where dossier_id is not null;
create index if not exists bouw7_offertes_project_idx
  on public.bouw7_offertes (bouw7_project_id);

comment on table public.bouw7_offertes is
  'Spiegel van /list/quotations: één rij per Bouw7-offerte. Leesbron voor de bewakingskaart bij meerdere offertes op één project.';
comment on column public.bouw7_offertes.datum is
  'Offertedatum uit Bouw7 (quotationDate) — betrouwbaarder voor "dagen open" dan dossiers.verzonden_op.';

do $triggers$
begin
  if not exists (select 1 from pg_trigger where tgname = 'set_updated_at_bouw7_offertes') then
    create trigger set_updated_at_bouw7_offertes
      before update on public.bouw7_offertes
      for each row execute function public.tg_set_updated_at();
  end if;
end $triggers$;

alter table public.bouw7_offertes enable row level security;
drop policy if exists platform_gebruikers_all on public.bouw7_offertes;
create policy platform_gebruikers_all on public.bouw7_offertes
  for all to authenticated using (is_platform_gebruiker()) with check (is_platform_gebruiker());
