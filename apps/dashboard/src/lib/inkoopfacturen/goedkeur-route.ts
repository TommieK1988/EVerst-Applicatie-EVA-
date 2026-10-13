/**
 * Pure kern van de EVA-goedkeuring van inkoopfacturen: welke stappen een factuur doorloopt en
 * welke tekstregel er in Bouw7 bij de factuur komt.
 *
 * Bewust zonder database en zonder `'use server'`, zodat de regels los te testen zijn en de
 * client de types mag importeren. De server-kant staat in `goedkeuren.ts` en `route.ts`.
 */

export type GoedkeurStapSoort = 'projectleider' | 'terugval' | 'drempel'
export type GoedkeurStapStatus = 'wacht' | 'open' | 'akkoord' | 'bezwaar' | 'vervallen'

/** Eén rij uit `inkoop_goedkeur_regels`. `divisie_bouw7_id: null` is de standaard. */
export type GoedkeurRegel = {
  divisie_bouw7_id: number | null
  terugval_goedkeurder_id: string | null
  drempel_excl: number | null
  drempel_goedkeurder_id: string | null
}

/** De route-regel die voor één administratie geldt: de eigen rij vult de standaard aan. */
export function regelVoorDivisie(regels: GoedkeurRegel[], divisieBouw7Id: number | null): GoedkeurRegel {
  const standaard = regels.find(r => r.divisie_bouw7_id == null)
  const eigen = divisieBouw7Id == null ? undefined : regels.find(r => r.divisie_bouw7_id === divisieBouw7Id)
  return {
    divisie_bouw7_id: divisieBouw7Id,
    terugval_goedkeurder_id: eigen?.terugval_goedkeurder_id ?? standaard?.terugval_goedkeurder_id ?? null,
    drempel_excl: eigen?.drempel_excl ?? standaard?.drempel_excl ?? null,
    drempel_goedkeurder_id: eigen?.drempel_goedkeurder_id ?? standaard?.drempel_goedkeurder_id ?? null,
  }
}

export type GeplandeStap = {
  stap: number
  soort: GoedkeurStapSoort
  /** Null = niemand aangewezen; dan kan alleen Directie de stap afhandelen of overdragen. */
  goedkeurder_id: string | null
}

/**
 * De stappen voor één factuur.
 *
 * 1. De projectleider van het dossier — zo deed Bouw7 het ook (op 13-10-2026 gemeten: bij alle 48
 *    openstaande projectfacturen was de Bouw7-goedkeurder de EVA-projectleider). Geen dossier of
 *    geen projectleider → de terugval van de administratie.
 * 2. Alleen boven de drempel (excl. btw): de drempelgoedkeurder, of leeg = iedereen uit Directie.
 *    Is dat dezelfde persoon als stap 1, dan vervalt de stap: twee keer dezelfde handtekening
 *    voegt niets toe.
 */
export function bepaalStappen(input: {
  projectleiderId: string | null
  bedragExcl: number | null
  regel: GoedkeurRegel
}): GeplandeStap[] {
  const { projectleiderId, bedragExcl, regel } = input
  const eerste: GeplandeStap = projectleiderId
    ? { stap: 1, soort: 'projectleider', goedkeurder_id: projectleiderId }
    : { stap: 1, soort: 'terugval', goedkeurder_id: regel.terugval_goedkeurder_id }

  const stappen = [eerste]
  const boven = regel.drempel_excl != null && bedragExcl != null && bedragExcl >= regel.drempel_excl
  const dubbel = regel.drempel_goedkeurder_id != null && regel.drempel_goedkeurder_id === eerste.goedkeurder_id
  if (boven && !dubbel) {
    stappen.push({ stap: 2, soort: 'drempel', goedkeurder_id: regel.drempel_goedkeurder_id })
  }
  return stappen
}

export const STAP_SOORT_LABEL: Record<GoedkeurStapSoort, string> = {
  projectleider: 'Projectleider',
  terugval: 'Vaste goedkeurder',
  drempel: 'Boven drempel',
}

/** Datum + tijd in de schrijfwijze van de administratie: `13-10-26 14:32`. */
export function korteDatumTijd(datum: string, tijd: string): string {
  const [j, m, d] = datum.split('-').map(Number)
  return `${d}-${m}-${String(j).slice(-2)} ${tijd.slice(0, 5)}`
}

/**
 * De tekstregel die bij de factuur in Bouw7 komt. Bouw7 zet de wijziging op naam van onze
 * API-gebruiker ("Beheerder EOB"); deze regel is dus de enige plek in Bouw7 waar staat wie het
 * akkoord gaf.
 */
export function besluitRegel(opts: {
  besluit: 'goedgekeurd' | 'afgekeurd'
  namen: string[]
  datumTijd: string
  toelichting?: string | null
}): string {
  const wie = opts.namen.filter(Boolean).join(' en ') || 'onbekend'
  const kop = `${opts.besluit === 'goedgekeurd' ? 'Goedgekeurd' : 'Afgekeurd'} in EVA door ${wie}, ${opts.datumTijd}`
  const extra = (opts.toelichting ?? '').replace(/\s+/g, ' ').trim()
  return extra ? `${kop} – ${extra}` : kop
}

/**
 * Voeg de regel toe aan het bestaande `comments`-veld. Daar staat vaak tekst die van de
 * leveranciersfactuur is overgenomen ("REF. : JOHN") — die blijft staan. Staat de regel er al
 * (een herhaalde poging na een mislukte statuswrite), dan verandert er niets.
 */
export function voegRegelToe(bestaand: string | null | undefined, regel: string): string {
  const huidig = (bestaand ?? '').trimEnd()
  if (huidig.includes(regel)) return huidig
  return huidig ? `${huidig}\n${regel}` : regel
}
