-- Aangenomen meerwerk wordt bij akkoord als termijn in de Bouw7-termijnstaat gezet, zodat het
-- vanuit EVA te factureren is. Het Bouw7-termijn-id maakt dat idempotent: een tweede akkoord of
-- een herkansing werkt dezelfde termijn bij in plaats van er een tweede te maken.
alter table public.meerwerk_regels
  add column if not exists bouw7_term_id bigint;
comment on column public.meerwerk_regels.bouw7_term_id is
  'Id van de Bouw7-verkooptermijn die voor dit (aangenomen) meerwerk is aangemaakt.';
