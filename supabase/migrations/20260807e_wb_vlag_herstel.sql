-- WB!-vlag opschonen na de kosten-backfill (20260807d).
--
-- `dossiers.wb_ongeaccordeerde_wijzigingen` is een afgeleide, gecachete vlag: hij
-- wordt herrekend zodra iemand de werkbegroting aanraakt (elke sync roept
-- refreshDossierWbVlag aan). Voor de dossiers die door de backfill weer volledig
-- geaccordeerd zijn, zou de kaart tot dat moment ten onrechte WB! blijven tonen.
--
-- Alleen dossiers waarvan de laatste goedgekeurde ronde aantoonbaar volledig dekt:
-- elke actieve regel heeft een snapshotrij, elke snapshotrij heeft nog een actieve
-- regel, en elk vastgelegd bedrag is gelijk aan het huidige bedrag. Dat is exact de
-- voorwaarde die berekenStatusUitData hanteert voor `volledigGoedgekeurd`.

with laatste as (
  select distinct on (g.object_id)
         g.object_id as wb_id, g.id as goedkeuring_id, g.dossier_id
  from public.goedkeuringen g
  where g.object_type = 'werkbegroting'
    and g.status = 'goedgekeurd'
    and g.dossier_id is not null
  order by g.object_id, g.ronde desc
),
huidig as (
  select l.goedkeuring_id, r.id as regel_id,
         coalesce(sum(
           floor(
             coalesce(r.hoeveelheid, 0)::double precision
             * coalesce(c.norm_hoeveelheid, 0)::double precision
             * coalesce(c.tarief, 0)::double precision
             * 100::double precision
             + 0.5
           )
         ), 0)::bigint as centen
  from laatste l
  join public.werkbegroting_regels r
    on r.werkbegroting_id = l.wb_id and r.is_verwijderd = false
  left join public.werkbegroting_componenten c
    on c.werkbegroting_regel_id = r.id and c.is_verwijderd = false
  group by l.goedkeuring_id, r.id
),
volledig as (
  select l.dossier_id
  from laatste l
  where exists (select 1 from public.werkbegroting_goedkeuring_regels s where s.goedkeuring_id = l.goedkeuring_id)
    -- geen actieve regel zonder snapshot
    and not exists (
      select 1 from huidig h
      where h.goedkeuring_id = l.goedkeuring_id
        and not exists (
          select 1 from public.werkbegroting_goedkeuring_regels s
          where s.goedkeuring_id = h.goedkeuring_id and s.regel_id = h.regel_id
        )
    )
    -- geen snapshotregel zonder (actieve) regel, en overal het bedrag gelijk
    and not exists (
      select 1 from public.werkbegroting_goedkeuring_regels s
      left join huidig h on h.goedkeuring_id = s.goedkeuring_id and h.regel_id = s.regel_id
      where s.goedkeuring_id = l.goedkeuring_id
        and (h.regel_id is null or s.kosten_centen is null or s.kosten_centen <> h.centen)
    )
)
update public.dossiers d
set wb_ongeaccordeerde_wijzigingen = false
where d.wb_ongeaccordeerde_wijzigingen
  and d.id in (select dossier_id from volledig);
