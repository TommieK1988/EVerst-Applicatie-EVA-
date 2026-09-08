import 'server-only'
import { pgQuery } from './db'
import { geocodeQuery } from './geocode'

/**
 * Coördinaten voor de eindpunten van ritten.
 *
 * WAAROM DIT NODIG IS — om een parkeerkost aan het juiste project te koppelen
 * moet je weten wáár de auto stond. ULU levert bij een rit wel een stop-adres
 * (100% gevuld), maar nauwelijks coördinaten: gemeten 119 van 10.970 ritten, en
 * geen enkele sinds augustus. Zonder deze stap heeft de toewijzing geen
 * geografisch signaal en belandt bijna alles in de werkvoorraad.
 *
 * De vertaling loopt via de bestaande Nominatim-geocoder mét cache
 * (public.geocode_cache), dus een adres kost hooguit één keer een netwerkcall.
 * Er zijn ~3.600 unieke stopadressen; bij ~1 call per seconde is dat een uur,
 * verspreid over cron-rondes. Vandaar `max` per aanroep, net als bij
 * geocodeDossiers() in de Bouw7-sync.
 */

export type GeocodeRittenResultaat = {
  adressenBekeken: number
  gevonden: number
  geenMatch: number
  rittenBijgewerkt: number
  /** Unieke stopadressen die daarna nog zonder coördinaat staan. */
  resterend: number
}

/**
 * ULU-adressen zijn Engelstalig geannoteerd ("The Hague", "South Holland") en
 * bevatten soms een benoemde locatie in plaats van een adres ("🌐 Everts Groep").
 * Nominatim vindt daar in Nederlandse context minder goed iets bij, dus we
 * normaliseren voordat we zoeken.
 */
const PLAATSVERTALING: Record<string, string> = {
  'the hague': 'Den Haag',
  'hague': 'Den Haag',
}

/** Provincies die ULU achter het adres plakt; die helpen de zoekopdracht niet. */
const PROVINCIES = [
  'south holland', 'north holland', 'north brabant', 'gelderland', 'utrecht',
  'overijssel', 'flevoland', 'friesland', 'groningen', 'drenthe', 'zeeland', 'limburg',
]

export function normaliseerStopAdres(ruw: string): string {
  // De 🌐-markering duidt een in ULU benoemde locatie aan (eigen pand,
  // vaste leverancier). De naam zelf kan Nominatim soms wél vinden.
  let s = ruw.replace(/🌐/g, ' ').replace(/\s+/g, ' ').trim()
  if (!s) return ''

  const delen = s.split(',').map((d) => d.trim()).filter(Boolean)
  const gefilterd = delen.filter((d) => !PROVINCIES.includes(d.toLowerCase()))

  const vertaald = gefilterd.map((deel) => {
    let d = deel
    for (const [en, nl] of Object.entries(PLAATSVERTALING)) {
      d = d.replace(new RegExp(`\b${en}\b`, 'gi'), nl)
    }
    // "Steenbokstraat , Kralingse Veer 3064" — ULU laat het huisnummer weg en
    // laat de spatie staan; die dubbele spatie stoort de zoekopdracht niet,
    // maar een losse komma ervoor wel.
    return d.replace(/\s+/g, ' ').trim()
  })

  s = vertaald.join(', ')
  return s ? `${s}, Nederland` : ''
}

export async function geocodeStopAdressen(
  opties: { max?: number; alleenMetParkeerkosten?: boolean } = {},
): Promise<GeocodeRittenResultaat> {
  const max = opties.max ?? 40
  const res: GeocodeRittenResultaat = {
    adressenBekeken: 0,
    gevonden: 0,
    geenMatch: 0,
    rittenBijgewerkt: 0,
    resterend: 0,
  }

  // Adressen waar een parkeerkost bij hoort gaan voor: die leveren direct een
  // toewijzing op. De rest volgt in latere rondes.
  const adressen = await pgQuery<{ adres: string; heeft_parkeren: boolean }>(
    `
    select t.adres_stop as adres,
           bool_or(exists (
             select 1 from public.ulu_parking p
              where p.kenteken = t.kenteken
                and p.parkeer_starttijd
                    between ((t.start_datum + coalesce(t.stop_tijd, t.start_tijd)) at time zone 'Europe/Amsterdam') - interval '1 hour'
                    and     ((t.start_datum + coalesce(t.stop_tijd, t.start_tijd)) at time zone 'Europe/Amsterdam') + interval '6 hours'
           )) as heeft_parkeren
      from public.ulu_trips t
     where t.adres_stop is not null and t.adres_stop <> ''
       and t.stop_lat is null
     group by t.adres_stop
     order by bool_or(exists (
             select 1 from public.ulu_parking p
              where p.kenteken = t.kenteken
                and p.parkeer_starttijd
                    between ((t.start_datum + coalesce(t.stop_tijd, t.start_tijd)) at time zone 'Europe/Amsterdam') - interval '1 hour'
                    and     ((t.start_datum + coalesce(t.stop_tijd, t.start_tijd)) at time zone 'Europe/Amsterdam') + interval '6 hours'
           )) desc,
           count(*) desc
     limit $1
    `,
    [max],
  )

  for (const a of adressen) {
    if (opties.alleenMetParkeerkosten && !a.heeft_parkeren) continue
    res.adressenBekeken++

    const query = normaliseerStopAdres(a.adres)
    const punt = query ? await geocodeQuery(query) : null

    if (!punt) {
      res.geenMatch++
      // Geen coördinaat gevonden: de rijen blijven leeg staan. De cache onthoudt
      // de misser, dus een volgende ronde kost hier geen netwerkcall meer — maar
      // hetzelfde adres komt wel opnieuw in deze lijst. Dat is bewust: verbetert
      // de normalisatie later, dan pikt de run ze vanzelf weer op.
      continue
    }

    res.gevonden++
    const bijgewerkt = await pgQuery<{ id: string }>(
      `update public.ulu_trips
          set stop_lat = $2, stop_lng = $3
        where adres_stop = $1 and stop_lat is null
        returning id`,
      [a.adres, punt.lat, punt.lng],
    )
    res.rittenBijgewerkt += bijgewerkt.length
  }

  const rest = await pgQuery<{ n: number }>(
    `select count(distinct adres_stop)::int as n
       from public.ulu_trips
      where adres_stop is not null and adres_stop <> '' and stop_lat is null`,
  )
  res.resterend = rest[0]?.n ?? 0

  return res
}
