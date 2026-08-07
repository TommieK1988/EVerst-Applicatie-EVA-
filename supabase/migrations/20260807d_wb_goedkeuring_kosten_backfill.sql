-- Bestaande goedkeuringen alsnog een bedrag geven.
--
-- Sinds 20260807b bewaakt de goedkeuring de kostprijs (`kosten_centen`) in plaats
-- van de volledige regelinhoud. Snapshots van vóór die kolom hebben nog geen bedrag
-- en vallen terug op `regel_hash`; de applicatie vult het bedrag alsnog in zodra
-- blijkt dat een regel nog ongewijzigd is.
--
-- Die zelfherstellende route helpt niet voor werkbegrotingen die al een niet-
-- financiële wijziging hadden ondergaan (een leverancier toegewezen na het akkoord).
-- Daar matcht de inhoudshash niet meer, dus wordt er nooit een bedrag ingevuld en
-- blijft de oude, te strenge regel gelden — precies de klacht die deze wijziging
-- moest oplossen.
--
-- Deze migratie vult het bedrag voor die gevallen in, maar alléén waar aantoonbaar
-- niets aan het geld is veranderd sinds het akkoord:
--   * geen wijziging in tarief, normhoeveelheid, hoeveelheid of is_verwijderd
--     (wijzigingslogboek) ná beoordeeld_op;
--   * geen component aangemaakt ná beoordeeld_op.
-- Blijft er ook maar één financieel spoor over, dan wordt de ronde overgeslagen en
-- blijft de werkbegroting terecht op "gewijzigd na goedkeuring" staan.
--
-- Alleen de laatste goedgekeurde ronde per werkbegroting doet ertoe (de statuslogica
-- kijkt niet verder terug); oudere rondes blijven ongemoeid als historie.
--
-- Het bedrag wordt op dezelfde manier gerekend als in kostenInCenten: per component
-- hoeveelheid × normhoeveelheid × tarief × 100, afgerond op hele centen en dan
-- opgeteld. `double precision` + floor(x + 0.5) geeft bit-voor-bit dezelfde uitkomst
-- als het JavaScript in de applicatie.

with laatste as (
  select distinct on (g.object_id)
         g.object_id as wb_id, g.id as goedkeuring_id, g.beoordeeld_op
  from public.goedkeuringen g
  where g.object_type = 'werkbegroting'
    and g.status = 'goedgekeurd'
    and g.beoordeeld_op is not null
  order by g.object_id, g.ronde desc
),
veilig as (
  select l.*
  from laatste l
  where not exists (
    select 1 from public.werkbegroting_wijzigingen w
    where w.werkbegroting_id = l.wb_id
      and w.aangemaakt_op > l.beoordeeld_op
      and w.veld in ('tarief', 'norm_hoeveelheid', 'hoeveelheid', 'is_verwijderd')
  )
  and not exists (
    select 1
    from public.werkbegroting_regels r
    join public.werkbegroting_componenten c on c.werkbegroting_regel_id = r.id
    where r.werkbegroting_id = l.wb_id
      and c.aangemaakt_op > l.beoordeeld_op
  )
),
bedragen as (
  select v.goedkeuring_id, r.id as regel_id,
         coalesce(sum(
           floor(
             coalesce(r.hoeveelheid, 0)::double precision
             * coalesce(c.norm_hoeveelheid, 0)::double precision
             * coalesce(c.tarief, 0)::double precision
             * 100::double precision
             + 0.5
           )
         ), 0)::bigint as centen
  from veilig v
  join public.werkbegroting_regels r
    on r.werkbegroting_id = v.wb_id and r.is_verwijderd = false
  left join public.werkbegroting_componenten c
    on c.werkbegroting_regel_id = r.id and c.is_verwijderd = false
  group by v.goedkeuring_id, r.id
)
update public.werkbegroting_goedkeuring_regels s
set kosten_centen = b.centen
from bedragen b
where s.goedkeuring_id = b.goedkeuring_id
  and s.regel_id = b.regel_id
  and s.kosten_centen is null;
