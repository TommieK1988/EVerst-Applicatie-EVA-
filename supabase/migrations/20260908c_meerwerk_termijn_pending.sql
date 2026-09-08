-- Herkansing voor de meerwerktermijn: alleen regels waarvan het zetten van de termijn bij akkoord
-- mislukte, niet álle bestaande aangenomen regels. Bij livegang stonden er 118 aangenomen regels
-- zonder termijn-id; die zijn destijds met de hand in Bouw7 afgehandeld en mogen niet alsnog
-- een tweede termijn krijgen.
alter table public.meerwerk_regels
  add column if not exists bouw7_term_pending boolean not null default false;
comment on column public.meerwerk_regels.bouw7_term_pending is
  'True zolang de termijn voor dit aangenomen meerwerk nog niet in de Bouw7-termijnstaat is gezet (herkansing via de cron).';
