-- Eén plek waar de vorm van het rechtendocument in SQL bekend is.
--
-- Drie plekken lazen `standaard_rechten` / `rechten_override` rechtstreeks uit
-- SQL om notificatie-ontvangers te bepalen (lib/wagenpark/notificaties.ts,
-- lib/wagenpark/compliance-kern.ts, lib/bouw7/sync.ts). Elk met een eigen
-- kopie van de merge-regel, en elk met de naam-join die 20260920d juist
-- verving. Die gaan nu alle drie hierdoorheen.
--
-- Let op de sleutelcontrole met `?` in plaats van coalesce: in JSONB levert
-- `->> 'x'` óók SQL NULL op als de sleutel bestaat maar de waarde JSON null is.
-- Met coalesce zou een persoonlijke "expliciet geen" terugvallen op de
-- afdelingswaarde — precies het omgekeerde van wat er bedoeld is.
create or replace function public.eva_recht(
  afdeling_rechten jsonb,
  eigen_rechten    jsonb,
  module           text,
  kanaal           text default 'desktop'
) returns text
language sql
immutable
as $$
  select case
    when coalesce(eigen_rechten, '{}'::jsonb) -> kanaal -> 'modules' ? module
      then coalesce(eigen_rechten, '{}'::jsonb) -> kanaal -> 'modules' ->> module
    else coalesce(afdeling_rechten, '{}'::jsonb) -> kanaal -> 'modules' ->> module
  end;
$$;

comment on function public.eva_recht(jsonb, jsonb, text, text) is
  'Effectief niveau (lezen/schrijven/beheren) voor een module op een kanaal: de '
  'afdelingsstandaard met de persoonlijke afwijking eroverheen. Spiegel van '
  'mergeKanaal() in packages/database/src/rechten-catalogus.ts.';

-- Haalt het niveau minstens `min`? Zelfde ladder als niveauHaalt() in de app.
create or replace function public.eva_recht_haalt(
  afdeling_rechten jsonb,
  eigen_rechten    jsonb,
  module           text,
  min_niveau       text,
  kanaal           text default 'desktop'
) returns boolean
language sql
immutable
as $$
  select coalesce(
    array_position(array['lezen','schrijven','beheren'],
                   public.eva_recht(afdeling_rechten, eigen_rechten, module, kanaal))
      >= array_position(array['lezen','schrijven','beheren'], min_niveau),
    false);
$$;
