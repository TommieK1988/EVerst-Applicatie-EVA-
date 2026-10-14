-- Volgende receptcode (XX-001) per prefix, berekend in de database.
--
-- Voorheen haalde slaRegelOpAlsRecept álle item_codes met dezelfde prefix op en
-- nam daar client-side het maximum van. Die select was onbegrensd: boven de
-- 1000 rijen kapt PostgREST stil af, het maximum valt dan te laag uit en er
-- komt een dubbele code uit. De functie hieronder rekent het maximum numeriek
-- uit (SC-10 > SC-9, wat een tekstsortering niet zou doen) en levert één rij.
--
-- Getal-afleiding gelijk aan de oude code: tweede '-'-segment, de cijfers
-- vooraan (parseInt-gedrag). Codes zonder getal tellen niet mee.
create or replace function public.volgende_receptcode(p_prefix text)
returns text
language sql
stable
security invoker
set search_path = public
as $$
  with nr as (
    select coalesce(max(
             substring(split_part(item_code, '-', 2) from '^[0-9]{1,18}')::bigint
           ), 0) + 1 as volgend
      from public.paint_items
     where left(item_code, length(p_prefix) + 1) = p_prefix || '-'
  )
  -- lpad kapt af bij langere getallen; padStart in JS deed dat niet.
  select p_prefix || '-' || case when length(volgend::text) < 3
                                 then lpad(volgend::text, 3, '0')
                                 else volgend::text end
    from nr;
$$;

revoke execute on function public.volgende_receptcode(text) from public, anon;
grant execute on function public.volgende_receptcode(text) to authenticated;

-- Een item_code is overal in EVA een sleutel (de Excel-import zoekt erop, de
-- calculatie toont hem als Code). Tot nu toe was hij alleen uniek per
-- treatment. Met een unieke index faalt een dubbele code luid in plaats van
-- stil, en vangt hij ook de race af als twee mensen tegelijk opslaan.
-- Gecontroleerd op 2026-10-14: 967 rijen, geen dubbele codes.
create unique index if not exists paint_items_item_code_uniek
  on public.paint_items (item_code);
