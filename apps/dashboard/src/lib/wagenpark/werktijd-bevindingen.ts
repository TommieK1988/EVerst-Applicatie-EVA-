/**
 * De R9/R10-bevindingen ophalen zoals de Werktijden-pagina ze toont.
 *
 * Staat apart van de pagina omdat er inmiddels twee afnemers zijn: het scherm
 * zelf en de PDF-uitdraai per medewerker. Die twee moeten per definitie
 * dezelfde rijen laten zien — een uitdraai die andere getallen geeft dan het
 * scherm waarop hij besproken wordt, is erger dan geen uitdraai.
 *
 * Zie `lib/wagenpark/werktijd.ts` voor de anker-valkuil: alleen de rit die de
 * tijd bepaalt draagt de minuten, de andere delen van dezelfde ritketen dragen
 * hetzelfde getal mee als verwijzing en zouden dus dubbel tellen.
 */
import 'server-only'
import { pgQuery } from '@/lib/wagenpark/db'
import { getUrenPerDag, uursoortLabel, type UrenPerDag } from '@/lib/wagenpark/werktijd-uren'
import {
  getAanwezigheidPerDag,
  aanwezigheidSleutel,
  REDEN_TEKST,
  type AanwezigheidPerDag,
} from '@/lib/wagenpark/werktijd-aanwezigheid'
import { vandaagNL } from '@/lib/wagenpark/periode'
import type {
  WerktijdRij,
  WerktijdBevindingRij,
} from '@/lib/wagenpark/werktijd-dag'

/**
 * `$1` = eerste dag, `$2` = laatste dag (beide inclusief), `$3` = ULU-id van
 * één bestuurder of `null` voor iedereen.
 */
const BEVINDINGEN_SQL = `
  select b.id,
         b.periode_start::text                       as datum,
         coalesce(b.data->>'soort',
                  case when b.regel_code = 'R9' then 'te_laat' else 'te_vroeg' end) as soort,
         (b.data->>'verschil_minuten')::int          as minuten,
         coalesce(b.data->>'verwacht_start', b.data->>'verwacht_eind') as verwacht,
         coalesce(b.data->>'aankomst_werk', b.data->>'vertrek_werk')   as werkelijk,
         coalesce((b.data->>'rooster_benadering')::boolean, false)     as benadering,
         b.ernst::text                               as ernst,
         b.status::text                              as status,
         b.regel_code,
         b.trip_id,
         (b.data->>'user_id_ulu')                    as user_id_ulu,
         coalesce(uu.volledige_naam, 'Bestuurder #' || (b.data->>'user_id_ulu')) as bestuurder,
         to_char(b.periode_start, 'IYYY-"W"IW')      as week,
         date_trunc('week', b.periode_start)::date::text as week_start,
         -- Brug naar de urenboekingen: het Bouw7-uurlog kent alleen een
         -- employee-id. Zie lib/wagenpark/werktijd-uren.ts.
         m.bouw7_id
    from public.compliance_bevindingen b
    left join public.ulu_users uu on uu.id::text = (b.data->>'user_id_ulu')
    left join public.medewerkers m on m.id = uu.medewerker_id
   where b.regel_code in ('R9', 'R10')
     and b.data->>'keten_rol' = 'anker'
     -- Alle statussen. NIET op status filteren: de waarde 'afgewezen'
     -- betekent hier "verklaring afgewezen, overtreding bevestigd" en niet
     -- "ingetrokken", dus wegfilteren zou juist de bevestigde gevallen
     -- verbergen. De werklijst wordt in de UI teruggebracht tot 'open'.
     and b.periode_start between $1::date and $2::date
     and ($3::text is null or b.data->>'user_id_ulu' = $3::text)
   order by b.periode_start desc
`

/**
 * Alle roosterwerkdagen in de periode, ongeacht of er een signaal op zit.
 *
 * De lijst toonde tot nu toe alleen de GEMARKEERDE dagen — de dagen waarop R9 of
 * R10 aansloeg. Dat is precies de verkeerde selectie zodra je aanwezigheid tegen
 * geschreven uren wilt leggen: een dag waarop iemand keurig binnen zijn
 * roostertijden kwam en ging kan nog steeds twee uur meer geschreven hebben dan
 * de auto op het werk stond, en die dag stond er dan niet bij.
 *
 * Een werkdag is hier: een dag die volgens het rooster van die medewerker een
 * werkdag is (`werkdagen` bevat de ISO-weekdag) en waarop dat rooster gold.
 * Dagen met verlof blijven staan — die zijn juist informatief: er staan uren op
 * (8,0 Vakantie) en er is geen auto, en dat is een verklaring, geen ruis.
 *
 * `$4` is de laatste dag die beoordeeld mag worden. Die komt uit de code en niet
 * uit `current_date`: op Vercel draait de server in UTC, en dan zou de lopende
 * Nederlandse dag er 's avonds ten onrechte bij komen als een dag zonder uren.
 *
 * `distinct` omdat twee elkaar overlappende roosters dezelfde dag twee keer
 * zouden opleveren.
 */
const WERKDAGEN_SQL = `
  select distinct on (uu.id, d::date)
         uu.id::text                                       as user_id_ulu,
         coalesce(uu.volledige_naam, 'Bestuurder #' || uu.id) as bestuurder,
         d::date::text                                     as datum,
         to_char(d::date, 'IYYY-"W"IW')                    as week,
         date_trunc('week', d::date)::date::text           as week_start,
         m.bouw7_id,
         r.dagstart::text                                  as rooster_start,
         r.dageind::text                                   as rooster_eind
    from generate_series($1::date, least($2::date, $4::date), interval '1 day') d
    join public.ulu_users uu
      on uu.medewerker_id is not null
     and uu.actief
     and ($3::text is null or uu.id::text = $3::text)
    join public.medewerkers m on m.id = uu.medewerker_id
    join public.medewerker_roosters r
      on r.medewerker_id = uu.medewerker_id
     and d::date >= r.geldig_vanaf
     and (r.geldig_tot is null or d::date <= r.geldig_tot)
     and extract(isodow from d::date)::smallint = any(r.werkdagen)
   order by uu.id, d::date, r.geldig_vanaf desc
`

/** De tijd-voor-tijd-reserveringen in de periode. */
const TVT_SQL = `
  select user_id_ulu::text as user_id_ulu, datum::text as datum,
         uren::float       as uren, toelichting
    from public.werktijd_tvt_reserveringen
   where datum between $1::date and $2::date
     and ($3::text is null or user_id_ulu::text = $3::text)
`

/**
 * Handmatig toegekende R9/R10-signalen hebben geen ritketen en dus geen minuten.
 * Ze stilzwijgend weglaten zou het beeld vertekenen, dus we tellen ze en melden
 * het aantal in de kop.
 */
const HANDMATIG_SQL = `
  select count(*)::int as aantal
    from public.compliance_bevindingen b
   where b.regel_code in ('R9', 'R10')
     and b.data->>'keten_rol' is null
     and b.periode_start between $1::date and $2::date
     and ($3::text is null or b.data->>'user_id_ulu' = $3::text)
`

export type WerktijdGegevens = {
  rijen: WerktijdRij[]
  /** Aantal handmatige signalen zonder minuten; alleen om te vermelden. */
  handmatigAantal: number
  /** Reden waarom de geboekte uren ontbreken, of null als ze er zijn. */
  urenFout: string | null
}

/** Eén R9/R10-bevinding zoals `BEVINDINGEN_SQL` hem oplevert. */
type BevindingRij = {
  id: string
  datum: string
  soort: 'te_laat' | 'te_vroeg'
  minuten: number
  verwacht: string | null
  werkelijk: string | null
  benadering: boolean
  ernst: 'info' | 'waarschuwing' | 'overtreding'
  status: string
  regel_code: string
  user_id_ulu: string
  bestuurder: string
  week: string
  week_start: string
  bouw7_id: string | null
}

/**
 * Hangt de geboekte Bouw7-uren en de aanwezigheid volgens de auto aan de dagen.
 */
function verrijk(
  dagen: WerktijdBevindingRij[],
  uren: UrenPerDag,
  aanwezigheid: AanwezigheidPerDag,
  tvt: Map<string, TvtRij>,
): WerktijdRij[] {
  return dagen.map((r) => {
    // Zonder Bouw7-koppeling of zonder bruikbare uren blijft `geboekt` null —
    // een streepje in de tabel, geen misleidende 0,0.
    const dag = uren.fout || !r.bouw7_id ? undefined : uren.perDag.get(`${r.bouw7_id}|${r.datum}`)
    const heeftUren = !uren.fout && !!r.bouw7_id
    const a = aanwezigheid.get(aanwezigheidSleutel(r.user_id_ulu, r.datum))
    return {
      ...r,
      geboekt: heeftUren ? dag?.totaal ?? 0 : null,
      // Let op het onderscheid: géén dagregel = niets geboekt = 0 arbeidsuren,
      // maar een dagregel met `werk: null` betekent "wel geboekt, alleen op een
      // uursoort die nog niet is ingedeeld". Die null moet blijven staan; een
      // `?? 0` erachter zou dat als "niets gewerkt" wegschrijven.
      arbeidsuren: heeftUren ? (dag ? dag.werk : 0) : null,
      uursoorten: uursoortLabel(dag),
      aankomst: a?.aankomst ?? null,
      vertrek: a?.vertrek ?? null,
      aanwezigMinuten: a?.nettoMinuten ?? null,
      pauzeMinuten: a?.pauzeMinuten ?? 0,
      pauzeInRooster: a?.pauzeInRooster ?? false,
      aanwezigReden: a?.reden ? REDEN_TEKST[a.reden] : a ? null : REDEN_TEKST.geen_ritten,
      tvtUren: tvt.get(`${r.user_id_ulu}|${r.datum}`)?.uren ?? null,
      tvtToelichting: tvt.get(`${r.user_id_ulu}|${r.datum}`)?.toelichting ?? null,
    }
  })
}

/** Een tijd-voor-tijd-reservering zoals `TVT_SQL` hem oplevert. */
type TvtRij = {
  user_id_ulu: string
  datum: string
  uren: number
  toelichting: string | null
}

/**
 * Alle werktijd-afwijkingen in een periode, optioneel van één bestuurder.
 *
 * De uren komen in één Bouw7-call voor de hele periode; faalt die, dan tonen de
 * urenkolommen een streepje en blijft de rest gewoon werken. Hetzelfde geldt
 * voor de aanwezigheid: die komt uit de ritten van dezelfde periode en is
 * fail-soft, want de lijst met afwijkingen moet ook zonder bruikbaar
 * aanwezigheidsvenster te lezen zijn.
 */
export async function laadWerktijdGegevens(
  van: string,
  tot: string,
  userIdUlu: string | null = null,
): Promise<WerktijdGegevens> {
  // De lopende dag is nog niet af en hoort er niet bij: die zou als een dag met
  // nul geboekte uren binnenkomen. Zelfde grens als R9/R10 aanhouden, en
  // uitgerekend in Nederlandse tijd — zie WERKDAGEN_SQL.
  const gisteren = vorigeDag(vandaagNL())

  const [bevindingen, werkdagen, handmatig, uren, aanwezigheid, tvtRijen] = await Promise.all([
    pgQuery<BevindingRij>(BEVINDINGEN_SQL, [van, tot, userIdUlu]),
    pgQuery<WerkdagRij>(WERKDAGEN_SQL, [van, tot, userIdUlu, gisteren]),
    pgQuery<{ aantal: number }>(HANDMATIG_SQL, [van, tot, userIdUlu]),
    getUrenPerDag(van, tot),
    getAanwezigheidPerDag(van, tot, userIdUlu),
    pgQuery<TvtRij>(TVT_SQL, [van, tot, userIdUlu]),
  ])
  const tvt = new Map(tvtRijen.map((t) => [`${t.user_id_ulu}|${t.datum}`, t]))

  return {
    rijen: verrijk(bouwDagen(bevindingen, werkdagen), uren, aanwezigheid, tvt),
    handmatigAantal: handmatig[0]?.aantal ?? 0,
    urenFout: uren.fout,
  }
}

/** Een roosterwerkdag zoals `WERKDAGEN_SQL` hem oplevert. */
type WerkdagRij = {
  user_id_ulu: string
  bestuurder: string
  datum: string
  week: string
  week_start: string
  bouw7_id: string | null
  rooster_start: string | null
  rooster_eind: string | null
}

/**
 * Van losse bevindingen naar één regel per bestuurderdag.
 *
 * Twee bronnen komen hier samen. De WERKDAGEN geven de dagen die er volgens het
 * rooster zijn; de BEVINDINGEN hangen daar hun afwijkingen aan. Een dag die
 * alleen in de bevindingen voorkomt — een signaal op een dag die volgens het
 * rooster geen werkdag was, of van een inmiddels inactieve bestuurder — blijft
 * gewoon staan. De werkdagenlijst vult aan, hij filtert niet: een bestaand
 * signaal mag nooit verdwijnen doordat een rooster later is aangepast.
 */
function bouwDagen(
  bevindingen: BevindingRij[],
  werkdagen: WerkdagRij[],
): WerktijdBevindingRij[] {
  const perDag = new Map<string, WerktijdBevindingRij>()

  const leeg = (d: {
    user_id_ulu: string
    bestuurder: string
    datum: string
    week: string
    week_start: string
    bouw7_id: string | null
    rooster_start?: string | null
    rooster_eind?: string | null
  }): WerktijdBevindingRij => ({
    id: `${d.user_id_ulu}|${d.datum}`,
    datum: d.datum,
    user_id_ulu: d.user_id_ulu,
    bestuurder: d.bestuurder,
    week: d.week,
    week_start: d.week_start,
    bouw7_id: d.bouw7_id,
    roosterStart: d.rooster_start ?? null,
    roosterEind: d.rooster_eind ?? null,
    teLaat: null,
    teVroeg: null,
  })

  for (const d of werkdagen) perDag.set(`${d.user_id_ulu}|${d.datum}`, leeg(d))

  for (const b of bevindingen) {
    const sleutel = `${b.user_id_ulu}|${b.datum}`
    let dag = perDag.get(sleutel)
    if (!dag) {
      dag = leeg(b)
      perDag.set(sleutel, dag)
    }
    const afwijking = {
      id: b.id,
      soort: b.soort,
      minuten: b.minuten,
      verwacht: b.verwacht,
      werkelijk: b.werkelijk,
      benadering: b.benadering,
      ernst: b.ernst,
      status: b.status,
    }
    // Twee bevindingen van dezelfde soort op één dag horen niet te bestaan (de
    // regels schrijven er één per dag), maar als het toch gebeurt wint de
    // laatste niet stilletjes: de zwaarste blijft staan.
    if (b.soort === 'te_laat') {
      if (!dag.teLaat || b.minuten > dag.teLaat.minuten) dag.teLaat = afwijking
      // Een bevinding op een dag die niet in de werkdagenlijst zat heeft nog
      // geen roostertijden; de bevinding zelf weet ze wel.
      dag.roosterStart ??= b.verwacht
    } else {
      if (!dag.teVroeg || b.minuten > dag.teVroeg.minuten) dag.teVroeg = afwijking
      dag.roosterEind ??= b.verwacht
    }
  }

  // Nieuwste bovenaan; de tabel sorteert zelf, maar de PDF en de tellingen
  // lopen deze volgorde af.
  return [...perDag.values()].sort((a, b) => b.datum.localeCompare(a.datum))
}

/** De dag vóór `datum` (YYYY-MM-DD), puur op de string gerekend. */
function vorigeDag(datum: string): string {
  const d = new Date(datum + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}
