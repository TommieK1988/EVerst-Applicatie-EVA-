-- Lay-out-soort: naast de offerte-lay-out bestaat er nu een lay-out voor de
-- interne begroting (de begrotingsstaat met uren, arbeid, materiaal,
-- onderaanneming, kostprijs en opslag).
--
-- Twee soorten in dezelfde tabel omdat ze hetzelfde Word-sjabloonmechanisme en
-- dezelfde samenvoegvelden delen; alleen de keuzelijst bij het aanmaken splitst.
-- Bestaande lay-outs zijn offerte-lay-outs.
--
-- `is_standaard` geldt vanaf nu per soort — zie setStandaardLayout().

alter table public.quote_layouts
  add column if not exists soort text not null default 'offerte';

alter table public.quote_layouts
  drop constraint if exists quote_layouts_soort_check;

alter table public.quote_layouts
  add constraint quote_layouts_soort_check
  check (soort in ('offerte', 'interne_begroting'));

comment on column public.quote_layouts.soort is
  'offerte = lay-out voor de verkoopofferte; interne_begroting = lay-out voor de interne begroting (begrotingsstaat). Nooit mailbaar vanuit EVA.';
