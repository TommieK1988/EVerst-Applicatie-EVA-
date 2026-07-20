import { startOfDay, parseISO, eachDayOfInterval, format, getISODay } from 'date-fns'
import type { MedewerkerRooster, MedewerkerAfwezigheid } from '@everts/database/platform-types'

/**
 * Berekent de geplande werkuren van één planitem op basis van het werkrooster
 * van de medewerker, i.p.v. een (mogelijk foutief) opgeslagen uren-veld.
 *
 * Loopt elke dag in [startDt, eindDt] af, slaat verlof/afwezigheid en
 * niet-werkdagen over, en telt per werkdag de roosteruren (dageind − dagstart) op.
 * Een blok over meerdere dagen kan dus ruim boven de 24 uur uitkomen.
 *
 * Dit is de canonieke EVA-berekening: dezelfde functie die de planning-UI
 * gebruikt bij het aanmaken/bewerken van een planitem.
 */
export function berekenWerkuren(
  medewerker_id: string,
  startDt: string,
  eindDt: string,
  roosters: MedewerkerRooster[],
  afwezigheid: MedewerkerAfwezigheid[],
): number {
  const medRoosters = roosters
    .filter(r => r.medewerker_id === medewerker_id)
    .sort((a, b) => b.geldig_vanaf.localeCompare(a.geldig_vanaf))
  const medAfwezig = afwezigheid.filter(a => a.medewerker_id === medewerker_id)
  const start = startOfDay(parseISO(startDt))
  const eind  = startOfDay(parseISO(eindDt))
  if (eind < start) return 0
  const days = eachDayOfInterval({ start, end: eind })
  let total = 0
  for (const dag of days) {
    const dagStr = format(dag, 'yyyy-MM-dd')
    if (medAfwezig.some(a => a.start_datum <= dagStr && a.eind_datum >= dagStr)) continue
    const rooster = medRoosters.find(r =>
      r.geldig_vanaf <= dagStr && (r.geldig_tot === null || r.geldig_tot >= dagStr),
    )
    if (!rooster) continue
    const isoDay = getISODay(dag)
    if (!(rooster.werkdagen as number[]).includes(isoDay)) continue
    const [sh, sm] = (rooster.dagstart as string).split(':').map(Number)
    const [eh, em] = (rooster.dageind as string).split(':').map(Number)
    total += (eh * 60 + em - sh * 60 - sm) / 60
  }
  return Math.round(total * 2) / 2 // afgerond op 0.5u
}

/**
 * Berekent de geplande arbeid-uren van één planitem voor overzichten per
 * bewakingscode: het aantal werkdagen in het blok × de contracturen per dag.
 *
 * Anders dan {@link berekenWerkuren}:
 *  - gebruikt het **meest recente** rooster van de medewerker, óók als het blok
 *    vóór de roostergeldigheid ligt (roosters bestaan vaak alleen vanaf recent,
 *    terwijl planning ook in het verleden ligt — anders zou dat 0 uur opleveren);
 *  - rekent met **contracturen/dag** (contracturen_per_week ÷ aantal werkdagen)
 *    i.p.v. dagstart–dageind, zodat pauzes en deeltijd correct meelopen;
 *  - valt terug op ma–vr × 8 uur als er helemaal geen rooster is.
 *
 * Verlof/afwezigheid en niet-werkdagen tellen niet mee. Een meerdaags blok komt
 * zo ruim boven de 24 uur uit — i.t.t. het (onbetrouwbare) opgeslagen uren-veld.
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
