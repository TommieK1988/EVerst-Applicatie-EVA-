import { startOfDay, parseISO, eachDayOfInterval, format, getISODay } from 'date-fns'
import type { MedewerkerRooster, MedewerkerAfwezigheid } from '@everts/database/platform-types'

/**
 * Berekent de geplande arbeid-uren van één planitem (één medewerker, blok van
 * start t/m eind): aantal werkdagen in het blok × de contracturen per dag.
 *
 * Dit is de enige plek waar "geplande uren" wordt bepaald — zowel in de
 * planning-UI (bewerken/toewijzen/slepen) als in de overzichten per
 * bewakingscode. Eén definitie, zodat dezelfde week overal hetzelfde aantal
 * uren oplevert.
 *
 * Regels:
 *  - **Contracturen per dag** (contracturen_per_week ÷ aantal werkdagen), niet
 *    dagstart–dageind. Een 37,5-uursrooster levert zo 7,5 u/dag en een volle
 *    week exact 37,5 u (dagstart–dageind zou 8,25 u/dag = 41,25 u geven).
 *  - Het **meest recente** rooster van de medewerker, óók als het blok vóór de
 *    roostergeldigheid ligt. Roosters bestaan vaak pas vanaf recent, terwijl er
 *    ook in het verleden gepland is; met een geldigheidsfilter zouden die dagen
 *    stilzwijgend op 0 uur uitkomen.
 *  - Verlof/afwezigheid en niet-werkdagen tellen niet mee.
 *  - Zonder rooster: terugval op ma–vr × 8 uur.
 *
 * Een meerdaags blok komt zo ruim boven de 24 uur uit — i.t.t. het opgeslagen
 * uren-veld uit Bouw7, dat daar onbetrouwbaar wordt ingevuld.
 */
export function berekenPlanUren(
  medewerker_id: string,
  startDt: string,
  eindDt: string,
  roosters: MedewerkerRooster[],
  afwezigheid: MedewerkerAfwezigheid[],
): number {
  const start = startOfDay(parseISO(startDt))
  const eind  = startOfDay(parseISO(eindDt))
  if (eind < start) return 0

  const rooster = roosters
    .filter(r => r.medewerker_id === medewerker_id)
    .sort((a, b) => b.geldig_vanaf.localeCompare(a.geldig_vanaf))[0]
  const werkdagen: number[] = rooster ? (rooster.werkdagen as number[]) : [1, 2, 3, 4, 5]
  const dagUren = rooster && werkdagen.length > 0
    ? Number(rooster.contracturen_per_week) / werkdagen.length
    : 8

  const medAfwezig = afwezigheid.filter(a => a.medewerker_id === medewerker_id)
  const days = eachDayOfInterval({ start, end: eind })
  let werkdagenTeller = 0
  for (const dag of days) {
    if (!werkdagen.includes(getISODay(dag))) continue
    const dagStr = format(dag, 'yyyy-MM-dd')
    if (medAfwezig.some(a => a.start_datum <= dagStr && a.eind_datum >= dagStr)) continue
    werkdagenTeller++
  }
  return Math.round(werkdagenTeller * dagUren * 2) / 2 // afgerond op 0.5u
}
