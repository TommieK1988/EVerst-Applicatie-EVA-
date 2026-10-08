import 'server-only'
import { berekenPlanUren, type PlanAfwezigheid, type PlanRooster } from './werkuren'
import { nlDelen } from './nl-tijd'

/**
 * Geplande uren voor planitems waarvan de server de periode bepaalt (kopiëren, een fase
 * verschuiven, de Bouw7-sync). Dezelfde rekenregel als de schermen (`werkuren.ts`); hier
 * alleen het ophalen van de roosters en het verlof dat ervoor nodig is.
 *
 * Wie een planitem van week 42 naar week 43 schuift, of het kopieert naar iemand met een
 * ander rooster, krijgt zo de uren van die nieuwe periode — niet het getal dat het origineel
 * toevallig had.
 */

type Blok = { medewerker_id: string; start_dt: string; eind_dt: string }

export type UrenRekenaar = (blok: Blok) => number

/** Laadt roosters en verlof voor deze blokken en geeft een rekenaar terug. */
export async function maakUrenRekenaar(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  blokken: Blok[],
): Promise<UrenRekenaar> {
  const medIds = [...new Set(blokken.map(b => b.medewerker_id).filter(Boolean))]
  if (medIds.length === 0) return () => 0

  const dagen = blokken.flatMap(b => [nlDelen(b.start_dt).datum, nlDelen(b.eind_dt).datum])
  const van = dagen.reduce((a, b) => (a < b ? a : b))
  const tot = dagen.reduce((a, b) => (a > b ? a : b))

  // Begrensd op deze medewerkers (en het verlof ook op de periode): ruim onder de 1000 rijen.
  const [roosterRes, afwRes] = await Promise.all([
    supabase.from('medewerker_roosters')
      .select('medewerker_id, geldig_vanaf, geldig_tot, dagstart, dageind, werkdagen, contracturen_per_week')
      .in('medewerker_id', medIds)
      .order('geldig_vanaf'),
    supabase.from('medewerker_afwezigheid')
      .select('medewerker_id, start_datum, eind_datum')
      .in('medewerker_id', medIds)
      .lte('start_datum', tot)
      .gte('eind_datum', van)
      .order('start_datum')
      .limit(1000),
  ])
  if (roosterRes.error) throw new Error(`Roosters ophalen mislukt: ${roosterRes.error.message}`)
  if (afwRes.error) throw new Error(`Afwezigheid ophalen mislukt: ${afwRes.error.message}`)

  const roosters = (roosterRes.data ?? []) as PlanRooster[]
  const afwezigheid = (afwRes.data ?? []) as PlanAfwezigheid[]
  return b => berekenPlanUren(b.medewerker_id, b.start_dt, b.eind_dt, roosters, afwezigheid)
}
