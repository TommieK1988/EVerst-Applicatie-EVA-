import type { MedewerkerRooster, MedewerkerAfwezigheid } from '@everts/database/platform-types'
import { nlDelen, plusDagen } from './nl-tijd'

/**
 * Geplande uren van een planitem, en welk stuk van een meerdaags planitem op een dag valt.
 *
 * Dit is de enige plek waar "geplande uren" wordt bepaald — de Medewerkerplanning, de
 * detailplanning, de Bouw7-sync, de budgetbewaking én de mobiele agenda rekenen hiermee.
 * Eén definitie, zodat hetzelfde blok overal hetzelfde aantal uren oplevert.
 *
 * **Hoe een meerdaags planitem gelezen wordt.** Een planitem is één blok van `start_dt` tot
 * `eind_dt`. Loopt het over meerdere dagen, dan betekent dat níet "dag en nacht door": de
 * eerste dag begint op de starttijd en eindigt op het einde van de werkdag, de dagen ertussen
 * zijn gewone roosterdagen, en de laatste dag begint op de roosterstart en eindigt op de
 * eindtijd. Ma 14:00 → vr 16:15 is dus: ma 14:00–16:15, di t/m do de hele werkdag, vr
 * werkdag-start tot 16:15. Een middernacht-tijd (Bouw7-dagblokken staan op 00:00) is geen
 * werktijd maar "de hele dag" en valt daardoor vanzelf op het rooster.
 *
 * Regels:
 *  - **Contracturen per dag** (contracturen_per_week ÷ aantal werkdagen) voor een volle dag,
 *    niet dagstart–dageind: het verschil is de pauze. 37,5 u op 07:30–16:15 is 7,5 u per dag.
 *  - Een **halve dag** telt de kloktijd, minus het deel van de pauze dat erin valt. De pauze
 *    ligt vanaf 12:00 (of midden in de werkdag als 12:00 erbuiten valt). Ma 14:00–16:15 = 2,25 u.
 *  - Niet-werkdagen tellen niet mee, behalve als het planitem alleen op die dag staat
 *    (zaterdag 08:00–12:00 ingepland = 4 u).
 *  - Het rooster dat **op die dag geldt**; is er geen, dan het meest recente. Roosters bestaan
 *    vaak pas vanaf recent, terwijl er ook in het verleden gepland is — zonder terugval zouden
 *    die dagen stilzwijgend op 0 uur uitkomen.
 *  - Verlof/afwezigheid telt niet mee.
 *  - Zonder rooster: ma–vr, 07:00–16:00, 8 uur.
 *
 * Alles in Nederlandse kloktijd (`nl-tijd`), niet in "lokale tijd": de Bouw7-sync draait op de
 * server in UTC, en daar zou middernacht NL de vórige dag zijn.
 */

export type PlanRooster = Pick<
  MedewerkerRooster,
  'medewerker_id' | 'geldig_vanaf' | 'geldig_tot' | 'dagstart' | 'dageind' | 'werkdagen' | 'contracturen_per_week'
>
export type PlanAfwezigheid = Pick<MedewerkerAfwezigheid, 'medewerker_id' | 'start_datum' | 'eind_datum'>

/** Een werkdag volgens het rooster: venster in minuten na middernacht en de uren van een volle dag. */
export type Werkdag = { werkdag: boolean; van: number; tot: number; urenPerDag: number }

/** Een stuk van een planitem op één dag, in minuten na middernacht (NL). */
export type DagBlok = { van: number; tot: number }

const STANDAARD = { van: 7 * 60, tot: 16 * 60, urenPerDag: 8, werkdagen: [1, 2, 3, 4, 5] }
const MIDDAG = 12 * 60
const DAG_MIN = 24 * 60
/** Harde bovengrens op het aantal dagen per blok: een corrupte einddatum mag geen lange lus geven. */
const MAX_DAGEN = 400

function minuten(t: string | null | undefined): number | null {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  return Number.isFinite(h) ? h * 60 + (m || 0) : null
}

/** ISO-weekdag (1 = maandag … 7 = zondag) van een 'YYYY-MM-DD'. */
function isoWeekdag(datum: string): number {
  const [y, m, d] = datum.split('-').map(Number)
  const dag = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return dag === 0 ? 7 : dag
}

/** Het rooster dat op `datum` geldt (laatst ingegane wint); anders het meest recente. */
export function roosterVoor(
  medewerker_id: string,
  datum: string,
  roosters: PlanRooster[],
): PlanRooster | null {
  const eigen = roosters
    .filter(r => r.medewerker_id === medewerker_id)
    .sort((a, b) => b.geldig_vanaf.localeCompare(a.geldig_vanaf))
  return eigen.find(r => r.geldig_vanaf <= datum && (r.geldig_tot == null || r.geldig_tot >= datum))
    ?? eigen[0]
    ?? null
}

/** De werkdag van een medewerker op `datum`: is het een werkdag, wanneer, en hoeveel uur. */
export function werkdagOp(medewerker_id: string, datum: string, roosters: PlanRooster[]): Werkdag {
  const r = roosterVoor(medewerker_id, datum, roosters)
  const werkdagen = (r?.werkdagen as number[] | null | undefined) ?? STANDAARD.werkdagen
  const van = minuten(r?.dagstart)
  const tot = minuten(r?.dageind)
  const geldigVenster = van != null && tot != null && tot > van
  const contract = Number(r?.contracturen_per_week) || 0 // numeric-kolom kan als string binnenkomen
  const urenPerDag = r && werkdagen.length > 0 && contract > 0
    ? contract / werkdagen.length
    : STANDAARD.urenPerDag
  return {
    werkdag: werkdagen.includes(isoWeekdag(datum)),
    van: geldigVenster ? van : STANDAARD.van,
    tot: geldigVenster ? tot : STANDAARD.tot,
    urenPerDag,
  }
}

/** Een moment als NL-datum + minuut van de dag. */
function nlMoment(iso: string): { datum: string; minuut: number } {
  const { datum, tijd } = nlDelen(iso)
  return { datum, minuut: minuten(tijd) ?? 0 }
}

/**
 * Het deel van een planitem (`startDt` → `eindDt`) dat op `datum` valt, zoals het daar gewerkt
 * wordt — zie de uitleg bovenaan. `null` als er die dag niet gewerkt wordt.
 */
export function blokOpDag(
  medewerker_id: string,
  startDt: string,
  eindDt: string,
  datum: string,
  roosters: PlanRooster[],
): DagBlok | null {
  const s = nlMoment(startDt)
  const e = nlMoment(eindDt)
  if (datum < s.datum || datum > e.datum) return null

  // Eigen kloktijd op deze dag: de start of het eind van het blok valt hier, en niet op middernacht.
  const eigenStart = datum === s.datum && s.minuut > 0
  const eigenEind  = datum === e.datum && e.minuut > 0
  // Het eind op exact middernacht hoort bij de dag ervóór (exclusieve eindtijd).
  if (datum === e.datum && e.minuut === 0) return null

  const wd = werkdagOp(medewerker_id, datum, roosters)
  // Een niet-werkdag telt alleen als het planitem helemaal op die dag staat: dan is iemand
  // bewust op zaterdag (of op zijn vrije vrijdag) ingepland. In een meerdaags blok is het de
  // vrije dag die er toevallig tussen valt.
  const laatsteDag = e.minuut === 0 ? plusDagen(e.datum, -1) : e.datum
  if (!wd.werkdag && s.datum !== laatsteDag) return null

  const van = eigenStart ? s.minuut : wd.van
  const tot = eigenEind ? e.minuut : wd.tot
  // Begint het blok pas ná de werkdag en loopt het door, dan telt die avond tot middernacht.
  const totGecorrigeerd = !eigenEind && tot <= van ? DAG_MIN : tot
  return totGecorrigeerd > van ? { van, tot: totGecorrigeerd } : null
}

/** Gewerkte uren in een dagblok: kloktijd minus de overlap met de pauze. */
function urenInBlok(blok: DagBlok, wd: Werkdag): number {
  const venster = wd.tot - wd.van
  const pauze = Math.max(0, venster - wd.urenPerDag * 60)
  const pauzeVan = MIDDAG >= wd.van && MIDDAG + pauze <= wd.tot ? MIDDAG : wd.van + (venster - pauze) / 2
  const pauzeOverlap = Math.max(0, Math.min(blok.tot, pauzeVan + pauze) - Math.max(blok.van, pauzeVan))
  return Math.max(0, blok.tot - blok.van - pauzeOverlap) / 60
}

/** Elke NL-kalenderdag waarop het blok (deels) valt, met het stuk op die dag. */
export function blokkenPerDag(
  medewerker_id: string,
  startDt: string,
  eindDt: string,
  roosters: PlanRooster[],
): { datum: string; blok: DagBlok }[] {
  const s = nlMoment(startDt).datum
  const e = nlMoment(eindDt).datum
  const uit: { datum: string; blok: DagBlok }[] = []
  for (let i = 0, datum = s; datum <= e && i < MAX_DAGEN; i++, datum = plusDagen(datum, 1)) {
    const blok = blokOpDag(medewerker_id, startDt, eindDt, datum, roosters)
    if (blok) uit.push({ datum, blok })
  }
  return uit
}

/**
 * Geplande uren van één planitem (één medewerker, `startDt` → `eindDt`), afgerond op een
 * kwartier. Zie de regels bovenaan.
 */
export function berekenPlanUren(
  medewerker_id: string,
  startDt: string,
  eindDt: string,
  roosters: PlanRooster[],
  afwezigheid: PlanAfwezigheid[] = [],
): number {
  if (!(new Date(eindDt).getTime() > new Date(startDt).getTime())) return 0
  const afwezig = afwezigheid.filter(a => a.medewerker_id === medewerker_id)
  let uren = 0
  for (const { datum, blok } of blokkenPerDag(medewerker_id, startDt, eindDt, roosters)) {
    if (afwezig.some(a => a.start_datum <= datum && a.eind_datum >= datum)) continue
    uren += urenInBlok(blok, werkdagOp(medewerker_id, datum, roosters))
  }
  return Math.round(uren * 4) / 4
}
