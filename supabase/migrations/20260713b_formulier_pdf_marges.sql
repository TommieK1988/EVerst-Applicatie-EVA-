-- Veilige marges (mm) voor de formulier-PDF wanneer er briefpapier is ingesteld.
-- Globaal instelbaar (één rij), zodat de inhoud binnen het briefhoofd/-voet valt
-- zonder dat elk formulier eigen opmaak nodig heeft.
alter table public.formulier_pdf_config
  add column if not exists briefpapier_marge_boven_mm int not null default 42,
  add column if not exists briefpapier_marge_onder_mm int not null default 26;
