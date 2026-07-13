import 'server-only'
import { pgQuery } from './db'

export type WeeksamenvattingResultaat = {
  verzonden: number
  overgeslagen_geen_account: number
  overgeslagen_geen_activiteit: number
  periode: { start: string; eind: string }
}

type BestuurderWeek = {
  ulu_id: number
  volledige_naam: string | null
  auth_user_id: string
  ritten: number
  km_zakelijk: number
  km_prive: number
  gem_score: number | null
  parkeer_acties: number
  parkeerkosten: number
}

/** Vorige kalenderweek (maandag t/m zondag) in UTC-datums (YYYY-MM-DD). */
function vorigeWeek(nu: Date): { start: string; eind: string } {
  const dow = nu.getUTCDay() // 0=zo .. 6=za
  const dezeMaandag = new Date(nu)
  dezeMaandag.setUTCDate(nu.getUTCDate() - ((dow + 6) % 7))
  const vorigeMaandag = new Date(dezeMaandag)
  vorigeMaandag.setUTCDate(dezeMaandag.getUTCDate() - 7)
  const vorigeZondag = new Date(dezeMaandag)
  vorigeZondag.setUTCDate(dezeMaandag.getUTCDate() - 1)
  return {
    start: vorigeMaandag.toISOString().slice(0, 10),
    eind: vorigeZondag.toISOString().slice(0, 10),
  }
}

function euro(n: number): string {
  return `€${n.toFixed(2).replace('.', ',')}`
}

function km(n: number): string {
  return `${Math.round(n).toLocaleString('nl-NL')} km`
}

/**
 * Genereer per bestuurder (met gekoppelde medewerker die een EVA-account heeft)
 * een in-app melding met de weeksamenvatting van rijgedrag + parkeerkosten over
 * de afgelopen week. Inserts gaan via de directe Postgres-pooler, consistent met
 * de rest van de wagenpark-module (en onafhankelijk van de gegenereerde types).
 */
export async function stuurWagenparkWeeksamenvatting(
  nu: Date = new Date(),
): Promise<WeeksamenvattingResultaat> {
  const periode = vorigeWeek(nu)

  const rijen = await pgQuery<BestuurderWeek>(
    `
    with periode as (select $1::date as start, $2::date as eind),
    trip_agg as (
      select uu.id as ulu_id,
             uu.volledige_naam,
             m.auth_user_id::text as auth_user_id,
             count(t.id)::int as ritten,
             coalesce(sum(case when coalesce(t.rit_type_override, t.rit_type_berekend) = 'zakelijk'
                               then t.afstand_km else 0 end), 0)::float as km_zakelijk,
             coalesce(sum(case when coalesce(t.rit_type_override, t.rit_type_berekend) = 'prive'
                               then t.afstand_km else 0 end), 0)::float as km_prive,
             round(avg(t.score))::int as gem_score
        from public.ulu_users uu
        join public.medewerkers m
          on m.id = uu.medewerker_id and m.auth_user_id is not null
        left join public.ulu_trips t
          on t.user_id_ulu = uu.id
         and t.start_datum between (select start from periode) and (select eind from periode)
       where uu.actief
       group by uu.id, uu.volledige_naam, m.auth_user_id
    ),
    park as (
      select q.bestuurder_ulu_id as ulu_id,
             count(*)::int as parkeer_acties,
             coalesce(sum(q.parkeerkosten), 0)::float as parkeerkosten
        from (
          select p.id,
                 p.parkeerkosten,
                 (select t.user_id_ulu from public.ulu_trips t
                   where t.kenteken = p.kenteken
                     and t.start_datum = p.parkeer_starttijd::date
                   order by abs(extract(epoch from (t.start_datum::timestamp + t.start_tijd) - p.parkeer_starttijd))
                   limit 1) as bestuurder_ulu_id
            from public.ulu_parking p
           where p.parkeer_starttijd::date between (select start from periode) and (select eind from periode)
        ) q
       where q.bestuurder_ulu_id is not null
       group by q.bestuurder_ulu_id
    )
    select ta.ulu_id, ta.volledige_naam, ta.auth_user_id,
           ta.ritten, ta.km_zakelijk, ta.km_prive, ta.gem_score,
           coalesce(pk.parkeer_acties, 0) as parkeer_acties,
           coalesce(pk.parkeerkosten, 0)::float as parkeerkosten
      from trip_agg ta
      left join park pk on pk.ulu_id = ta.ulu_id
    `,
    [periode.start, periode.eind],
  )

  let verzonden = 0
  let overgeslagenGeenActiviteit = 0

  for (const r of rijen) {
    const heeftActiviteit = r.ritten > 0 || r.parkeer_acties > 0
    if (!heeftActiviteit) {
      overgeslagenGeenActiviteit++
      continue
    }

    const titel = `Weeksamenvatting ${periode.start} t/m ${periode.eind}`
    const scoreTekst = r.gem_score != null ? `gemiddelde rijscore ${r.gem_score}` : 'geen rijscore'
    const body =
      `${r.ritten} rit${r.ritten === 1 ? '' : 'ten'} · ` +
      `${km(r.km_zakelijk)} zakelijk · ${km(r.km_prive)} privé · ${scoreTekst}. ` +
      `Parkeren: ${r.parkeer_acties}× · ${euro(r.parkeerkosten)}.`

    await pgQuery(
      `insert into public.notificaties (user_id, type, titel, body, gelezen)
       values ($1, 'algemeen', $2, $3, false)`,
      [r.auth_user_id, titel, body],
    )
    verzonden++
  }

  return {
    verzonden,
    // Bestuurders zonder gekoppelde medewerker/account vallen al buiten de query.
    overgeslagen_geen_account: 0,
    overgeslagen_geen_activiteit: overgeslagenGeenActiviteit,
    periode,
  }
}
