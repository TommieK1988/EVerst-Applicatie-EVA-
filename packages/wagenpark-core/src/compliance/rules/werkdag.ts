/**
 * Gedeelde bouwstenen voor de werkdag-regels R9 (te laat op werk) en R10 (te
 * vroeg van werk).
 *
 * De kern is het begrip RITKETEN. Eén verplaatsing van huis naar het werk staat
 * in de rittenregistratie zelden als één rit: de bestuurder tankt onderweg, gaat
 * langs de groothandel, haalt een collega op, of de tracker knipt de rit per
 * ongeluk in tweeën. Kijk je naar losse ritten, dan lees je zo'n tussenstop aan
 * voor "aangekomen op het werk".
 *
 * Daarom plakken we opeenvolgende ritten aan elkaar zolang de tussenstop korter
 * is dan `pauzeMin`. Wat overblijft is per dag een handvol ketens:
 *
 *   - de EERSTE keten brengt de bestuurder van huis naar zijn eerste werkplek —
 *     het einde daarvan is de aankomst op het werk;
 *   - de LAATSTE keten brengt hem weer weg — het begin daarvan is het vertrek.
 *
 * Elke stop die geen tankstop of knipfout is telt als werkplek: een bouwadres,
 * de groothandel, het eigen depot. Er komt dus geen adres, coördinaat of
 * planning aan te pas — dat maakt de regel bestand tegen een verouderd
 * woonadres, een leeg dossier-werkadres of een geofence-naam zonder adres.
 */

import type { UluTrip } from '../../types'

/** Rooster-regel zoals in public.medewerker_roosters. */
export type RoosterInfo = {
  medewerker_id: string
  geldig_vanaf: string
  geldig_tot: string | null
  /** ISO-weekdagen: 1 = maandag .. 7 = zondag. */
  werkdagen: number[]
  dagstart: string
  dageind: string
}

/** Afwezigheidsregel zoals in public.medewerker_afwezigheid. */
export type AfwezigInfo = {
  medewerker_id: string
  type: string
  start_datum: string
  eind_datum: string | null
  /** Gevuld bij een deeldag; beide leeg = de hele dag. */
  start_tijd: string | null
  eind_tijd: string | null
}

/** "HH:MM[:SS]" → minuten sinds middernacht. Null bij onbruikbare invoer. */
export function parseHM(t: string | null | undefined): number | null {
  if (!t) return null
  const [h, m] = t.slice(0, 5).split(':').map(Number)
  if (!Number.isFinite(h)) return null
  return h * 60 + (Number.isFinite(m) ? m : 0)
}

/** ISO-weekdag: 1 = maandag .. 7 = zondag. */
export function isoWeekdag(datum: string): number {
  const dow = new Date(datum + 'T12:00:00Z').getUTCDay() // 0 = zo .. 6 = za
  return dow === 0 ? 7 : dow
}

export const DAG_NAMEN = [
  '', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag',
]

/** Vandaag als YYYY-MM-DD in Nederlandse tijd. */
export function vandaagNL(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Amsterdam' })
}

export type VerwachteTijden = {
  isWerkdag: boolean
  /** Minuten sinds middernacht, of null als er geen tijd bekend is. */
  start: number | null
  eind: number | null
  startLabel: string | null
  eindLabel: string | null
  /** De roostertijd komt uit een rooster dat op deze datum formeel nog niet gold. */
  benadering: boolean
}

/**
 * Verwachte werktijden voor een medewerker op een datum.
 *
 * Bron is `medewerker_roosters`; ontbreekt dat, dan `ulu_users.werktijd_*` met
 * ma-vr als werkweek. Dekt geen enkel rooster de datum, dan pakken we het
 * dichtstbijzijnde en markeren dat als benadering — dat komt voor zodra je een
 * periode analyseert van vóór de dag dat het rooster werd ingevoerd, en zonder
 * die terugval krijgt zo'n bestuurder nooit een signaal.
 */
export function verwachteTijden(
  datum: string,
  roosters: RoosterInfo[],
  fallback: { werktijd_start: string | null; werktijd_eind: string | null },
): VerwachteTijden {
  const iso = isoWeekdag(datum)

  // Roosters worden aflopend op geldig_vanaf aangeleverd.
  let rooster = roosters.find(
    (r) => r.geldig_vanaf <= datum && (r.geldig_tot == null || r.geldig_tot >= datum),
  )
  let benadering = false
  if (!rooster && roosters.length > 0) {
    const oudste = roosters[roosters.length - 1]
    rooster = datum < oudste.geldig_vanaf ? oudste : roosters[0]
    benadering = true
  }

  if (rooster) {
    const werkdag = Array.isArray(rooster.werkdagen) && rooster.werkdagen.includes(iso)
    return {
      isWerkdag: werkdag,
      start: werkdag ? parseHM(rooster.dagstart) : null,
      eind: werkdag ? parseHM(rooster.dageind) : null,
      startLabel: werkdag ? rooster.dagstart.slice(0, 5) : null,
      eindLabel: werkdag ? rooster.dageind.slice(0, 5) : null,
      benadering,
    }
  }

  const werkdag = iso >= 1 && iso <= 5
  return {
    isWerkdag: werkdag,
    start: werkdag ? parseHM(fallback.werktijd_start) : null,
    eind: werkdag ? parseHM(fallback.werktijd_eind) : null,
    startLabel: werkdag ? fallback.werktijd_start?.slice(0, 5) ?? null : null,
    eindLabel: werkdag ? fallback.werktijd_eind?.slice(0, 5) ?? null : null,
    benadering: false,
  }
}

/** De afwezigheidsregel die deze datum dekt, of null. */
export function afwezigheidOpDag(datum: string, regels: AfwezigInfo[]): AfwezigInfo | null {
  return (
    regels.find((a) => a.start_datum <= datum && (a.eind_datum ?? a.start_datum) >= datum) ?? null
  )
}

/** Afwezig zonder tijdvak = de hele dag weg; die dag beoordelen we niet. */
export function isHeleDagAfwezig(afw: AfwezigInfo | null): boolean {
  return afw != null && afw.start_tijd == null && afw.eind_tijd == null
}

/**
 * Groepeer de ritten van één dag tot ketens.
 *
 * Twee opeenvolgende ritten horen bij dezelfde keten als de bestuurder er minder
 * dan `pauzeMin` tussen stilstond. Ritten worden op starttijd gesorteerd; een rit
 * die over middernacht loopt (`stop_tijd` < `start_tijd`) sluit de keten af, want
 * de tussentijd tot de volgende rit is dan niet zinnig te berekenen. Zonder die
 * uitzondering las de oude R10 een stoptijd van 00:04 als "971 minuten te vroeg
 * weg".
 */
export function bouwKetens(ritten: UluTrip[], pauzeMin: number): UluTrip[][] {
  const gesorteerd = [...ritten].sort((a, b) => a.start_tijd.localeCompare(b.start_tijd))
  const ketens: UluTrip[][] = []
  let huidige: UluTrip[] = []
  let vorigeStop: number | null = null

  for (const rit of gesorteerd) {
    const start = parseHM(rit.start_tijd)
    const stop = parseHM(rit.stop_tijd ?? rit.start_tijd)
    const overMiddernacht = start != null && stop != null && stop < start

    if (
      huidige.length > 0 &&
      vorigeStop != null &&
      start != null &&
      start - vorigeStop < pauzeMin
    ) {
      huidige.push(rit)
    } else {
      if (huidige.length > 0) ketens.push(huidige)
      huidige = [rit]
    }

    if (overMiddernacht) {
      ketens.push(huidige)
      huidige = []
      vorigeStop = null
    } else {
      vorigeStop = stop
    }
  }
  if (huidige.length > 0) ketens.push(huidige)
  return ketens
}

/** Aankomsttijd van een keten: de stoptijd van de laatste rit erin. */
export function ketenAankomst(keten: UluTrip[]): { trip: UluTrip; minuten: number | null } {
  const trip = keten[keten.length - 1]
  return { trip, minuten: parseHM(trip.stop_tijd ?? trip.start_tijd) }
}

/** Vertrektijd van een keten: de starttijd van de eerste rit erin. */
export function ketenVertrek(keten: UluTrip[]): { trip: UluTrip; minuten: number | null } {
  const trip = keten[0]
  return { trip, minuten: parseHM(trip.start_tijd) }
}

/** "1u05" / "18 min" — voor in de omschrijving van een bevinding. */
export function duurLabel(minuten: number): string {
  const u = Math.floor(minuten / 60)
  const m = Math.round(minuten % 60)
  return u > 0 ? `${u}u${String(m).padStart(2, '0')}` : `${m} min`
}

/** Eén bestuurder-dag met zijn zakelijke ritten. */
export type BestuurderDag = {
  /**
   * De bestuurder-id precies zoals hij in de rit staat. Bewust niet omgezet:
   * `user_id_ulu` is een bigint en node-postgres levert die als string, terwijl
   * het type een number belooft. De `uluUsers`-map is met dezelfde ruwe waarde
   * gevuld, dus alleen een ongewijzigde waarde vindt zijn bestuurder terug —
   * een `Number(...)` ertussen laat elke lookup stilletjes mislukken.
   */
  userId: UluTrip['user_id_ulu']
  datum: string
  ritten: UluTrip[]
}

/**
 * Groepeer de zakelijke ritten per (bestuurder × datum).
 *
 * Privéritten vallen af: een ritje naar de sportschool om 06:00 zou anders als
 * "aankomst op het werk" gelden en een te late aankomst wegpoetsen.
 */
export function zakelijkeRittenPerDag(trips: UluTrip[]): BestuurderDag[] {
  const perDag = new Map<string, BestuurderDag>()
  for (const t of trips) {
    if (t.user_id_ulu == null) continue
    if (t.rit_type_berekend !== 'zakelijk') continue
    const key = `${t.user_id_ulu}|${t.start_datum}`
    const bestaand = perDag.get(key)
    if (bestaand) bestaand.ritten.push(t)
    else perDag.set(key, { userId: t.user_id_ulu, datum: t.start_datum, ritten: [t] })
  }
  return [...perDag.values()]
}
