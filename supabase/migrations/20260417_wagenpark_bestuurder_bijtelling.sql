-- =====================================================================
-- Wagenpark — bijtelling per bestuurder
-- =====================================================================
-- Bijtelling kan per bestuurder verschillen (de persoon betaalt, niet het
-- voertuig). Compliance R2 gebruikt deze vlag als eerste bron; voertuig-
-- niveau is een fallback.
-- =====================================================================

alter table public.ulu_users
  add column if not exists bijtelling_betaald boolean not null default false,
  add column if not exists prive_limiet_km_jaar int,
  add column if not exists zakelijk_verwacht_km_jaar int,
  add column if not exists opmerkingen text;

-- Partial index voor snelle filter op bestuurders met bijtelling
create index if not exists ulu_users_bijtelling_idx
  on public.ulu_users (id)
  where bijtelling_betaald = true;
