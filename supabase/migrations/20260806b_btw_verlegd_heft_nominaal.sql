-- Verlegde BTW-tarieven heffen hun nominale percentage.
--
-- Correctie op 20260806_btw_tarief_koppeling.sql. Daar ging ik uit van de
-- verleggingsregeling: verlegd ⇒ 0% heffen. Vastgelegde bedrijfskeuze (Tom, 6 aug 2026):
-- een verlegd tarief brengt hier gewoon zijn eigen percentage in rekening en dat bedrag
-- telt mee in het totaal inclusief BTW. `btw_pct` is dus altijd gelijk aan het nominale
-- tarief; `verlegd` bepaalt alleen nog de naamgeving en de vermelding op de offerte.
--
-- Bouw7 zet die percentages niet consequent weg ("Verlegd Hoog 21%" = 21, maar
-- "Verlegd 21%" en "Verlegd 9%" = 0), dus leiden we het nominale tarief uit het label af
-- zodra een verlegd tarief 0 draagt — gelijk aan nominaalPercentage() in lib/stamdata/btw.ts.
-- Die afleiding staat hieronder bewust per statement herhaald: een view in `public` zou
-- zonder security_invoker de RLS op btw_tarieven omzeilen.

comment on column public.quote_lines.btw_tarief_id is
  'Gekozen BTW-tarief (btw_tarieven). btw_pct = het nominale percentage van dat tarief, ook bij verlegging.';

-- 1. Offerteregels
with verlegd as (
  select id, case when percentage > 0 then percentage
                  else coalesce(nullif(substring(label from '(\d+)\s*%'), '')::numeric, percentage)
             end as nominaal
  from public.btw_tarieven where verlegd
)
update public.quote_lines l
set btw_pct = v.nominaal
from verlegd v
where l.btw_tarief_id = v.id
  and l.btw_pct is distinct from v.nominaal;

-- 2. Werkbegrotingregels
with verlegd as (
  select id, case when percentage > 0 then percentage
                  else coalesce(nullif(substring(label from '(\d+)\s*%'), '')::numeric, percentage)
             end as nominaal
  from public.btw_tarieven where verlegd
)
update public.werkbegroting_regels r
set btw_pct = v.nominaal
from verlegd v
where r.btw_tarief_id = v.id
  and r.btw_pct is distinct from v.nominaal;

-- 3. Calculatieregels in de JSONB-snapshots
update public.calculatie_snapshots s
set data = jsonb_set(s.data, '{regels}', (
      select coalesce(jsonb_agg(
               case when v.nominaal is not null
                    then jsonb_set(e.regel, '{btw_pct}', to_jsonb(v.nominaal))
                    else e.regel
               end
               order by e.ord
             ), '[]'::jsonb)
      from jsonb_array_elements(s.data->'regels') with ordinality as e(regel, ord)
      left join (
        select id, case when percentage > 0 then percentage
                        else coalesce(nullif(substring(label from '(\d+)\s*%'), '')::numeric, percentage)
                   end as nominaal
        from public.btw_tarieven where verlegd
      ) v on v.id::text = e.regel->>'btw_tarief_id'
    ))
where s.data ? 'regels'
  and exists (
    select 1
    from jsonb_array_elements(s.data->'regels') as e(regel)
    join public.btw_tarieven t on t.id::text = e.regel->>'btw_tarief_id'
    where t.verlegd
  );

-- 4. Offertetotalen herberekenen voor de geraakte offertes. Zelfde rekenwijze als
--    herbereken() in actions/quotes.ts: opties tellen nooit mee, stelposten alleen als
--    stelposten_in_totaal aan staat, en de BTW schaalt met die keuze mee.
with geraakt as (
  select distinct l.quote_id
  from public.quote_lines l
  join public.btw_tarieven t on t.id = l.btw_tarief_id
  where t.verlegd
),
regels as (
  select l.quote_id, l.line_total, l.btw_pct, l.is_stelpost,
         coalesce(sec.is_optioneel, false) as is_optie
  from public.quote_lines l
  join geraakt g on g.quote_id = l.quote_id
  left join public.quote_sections sec on sec.id = l.section_id
),
sommen as (
  select r.quote_id,
         sum(r.line_total) filter (where not r.is_optie and not r.is_stelpost) as normaal_ex,
         sum(r.line_total) filter (where not r.is_optie and r.is_stelpost)     as stelpost_ex,
         sum(r.line_total) filter (where r.is_optie)                           as optie_ex
  from regels r group by r.quote_id
),
basis as (
  select s.quote_id,
         coalesce(s.normaal_ex, 0)  as normaal_ex,
         coalesce(s.stelpost_ex, 0) as stelpost_ex,
         coalesce(s.optie_ex, 0)    as optie_ex,
         coalesce(s.normaal_ex, 0)
           + case when q.stelposten_in_totaal then coalesce(s.stelpost_ex, 0) else 0 end as subtotaal_base
  from sommen s join public.quotes q on q.id = s.quote_id
),
btw as (
  select b.quote_id,
         round(sum(r.line_total
                   * case when (b.normaal_ex + b.stelpost_ex) > 0
                          then b.subtotaal_base / (b.normaal_ex + b.stelpost_ex) else 1 end
                   * r.btw_pct / 100), 2) as btw_bedrag
  from regels r join basis b on b.quote_id = r.quote_id
  where not r.is_optie
  group by b.quote_id
)
update public.quotes q
set subtotaal_ex_btw     = round(b.subtotaal_base, 2),
    btw_bedrag           = coalesce(w.btw_bedrag, 0),
    totaal_inc_btw       = round(b.subtotaal_base, 2) + coalesce(w.btw_bedrag, 0),
    stelposten_subtotaal = round(b.stelpost_ex, 2),
    opties_subtotaal     = round(b.optie_ex, 2),
    updated_at           = now()
from basis b
left join btw w on w.quote_id = b.quote_id
where q.id = b.quote_id;
