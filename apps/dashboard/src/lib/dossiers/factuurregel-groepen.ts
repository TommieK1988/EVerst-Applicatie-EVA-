/**
 * Van geboekte uren en kosten naar de regels die de klant op zijn factuur ziet.
 *
 * Bewust pure rekenlogica zonder database: dezelfde functies bepalen wat het scherm toont én wat er
 * naar Bouw7 gaat. Zou het scherm zelf groeperen, dan kan een verouderd tabblad een factuur laten
 * maken die er anders uitziet dan wat er op het scherm stond.
 *
 * Een factuurregel is een groep boekingen met een sleutel. Die sleutel is betekenisdragend, zodat
 * een groep kan bestaan zonder dat er iets van opgeslagen is — pas wie een eigen tekst, bedrag, btw
 * of uitzetting instelt krijgt een rij in `factuur_regelgroepen`. Boekingen die later binnenkomen
 * vallen via dezelfde regel vanzelf op de juiste plek.
 */

export type Groepering = 'per_soort' | 'samen' | 'per_boeking'

export const GROEPERINGEN: { waarde: Groepering; label: string; uitleg: string }[] = [
  {
    waarde: 'per_soort',
    label: 'Per soort werk',
    uitleg: 'Uren bij uren, materiaal bij materiaal. Nieuwe boekingen sluiten vanzelf aan.',
  },
  {
    waarde: 'samen',
    label: 'Alles op één regel',
    uitleg: 'De hele post komt als één bedrag op de factuur.',
  },
  {
    waarde: 'per_boeking',
    label: 'Elke boeking apart',
    uitleg: 'Iedere urenregel en kostenpost wordt een eigen factuurregel.',
  },
]

/** Het minimum dat de groepering van een boeking nodig heeft. */
export type GroepeerbareBoeking = {
  bronType: 'uur' | 'kost'
  bronBouw7Id: string
  uursoort: string | null
  kostensoort: string | null
  /** Handmatige toewijzing; wint altijd van de groepering. */
  groepSleutel: string | null
}

/** Soortnaam waarop `per_soort` bundelt: de uursoort, of anders de kostensoort. */
export function soortVan(b: GroepeerbareBoeking): string {
  const soort = b.bronType === 'uur' ? b.uursoort : b.kostensoort
  return (soort ?? '').trim() || (b.bronType === 'uur' ? 'Uren' : 'Overige kosten')
}

/**
 * In welke factuurregel valt deze boeking? Een handmatige toewijzing wint; anders bepaalt de
 * groepering van de bewakingscode het.
 */
export function groepSleutelVoor(b: GroepeerbareBoeking, groepering: Groepering): string {
  if (b.groepSleutel) return b.groepSleutel
  switch (groepering) {
    case 'samen': return 'alles'
    case 'per_boeking': return `bron:${b.bronType}:${b.bronBouw7Id}`
    default: return `${b.bronType}:${soortVan(b)}`
  }
}

/** Sleutel voor een handmatig samengevoegde regel. Los van elke groepering, dus hij blijft staan. */
export function nieuweHandmatigeSleutel(): string {
  return 'hand:' + Math.random().toString(36).slice(2, 10)
}

export function isHandmatigeGroep(sleutel: string): boolean {
  return sleutel.startsWith('hand:')
}

/**
 * Tekst die op de factuur komt als er geen eigen omschrijving is ingevuld.
 *
 * De naam van de bewakingscode blijft leidend — dat is wat de klant herkent — met de soort erachter
 * zodra een post over meerdere regels verdeeld is. Bij één regel zou dat achtervoegsel alleen maar
 * ruis zijn.
 */
export function afgeleideOmschrijving(
  sleutel: string,
  codeOmschrijving: string,
  opties?: { alleenRegel?: boolean; boekingOmschrijving?: string | null },
): string {
  if (sleutel === 'alles' || opties?.alleenRegel) return codeOmschrijving
  if (sleutel.startsWith('bron:')) {
    const eigen = (opties?.boekingOmschrijving ?? '').trim()
    return eigen ? `${codeOmschrijving} — ${eigen}` : codeOmschrijving
  }
  const soort = sleutel.slice(sleutel.indexOf(':') + 1).trim()
  if (!soort) return codeOmschrijving
  return `${codeOmschrijving} — ${soort.toLowerCase()}`
}

const rond = (n: number): number => Math.round(n * 100) / 100

export type GegroepeerdeRegel<T> = {
  groepSleutel: string
  boekingen: T[]
  /** Som van de verkoopbedragen van de boekingen in deze groep. */
  berekend: number
}

/**
 * Bundelt boekingen tot factuurregels. De volgorde is die waarin de groepen voor het eerst
 * voorkomen, zodat het scherm en de factuur dezelfde volgorde aanhouden.
 */
export function groepeer<T extends GroepeerbareBoeking & { verkoopBedrag: number }>(
  boekingen: T[],
  groepering: Groepering,
): GegroepeerdeRegel<T>[] {
  const uit: GegroepeerdeRegel<T>[] = []
  const index = new Map<string, GegroepeerdeRegel<T>>()
  for (const b of boekingen) {
    const sleutel = groepSleutelVoor(b, groepering)
    let groep = index.get(sleutel)
    if (!groep) {
      groep = { groepSleutel: sleutel, boekingen: [], berekend: 0 }
      index.set(sleutel, groep)
      uit.push(groep)
    }
    groep.boekingen.push(b)
    groep.berekend = rond(groep.berekend + (b.verkoopBedrag || 0))
  }
  return uit
}

/**
 * Aantal en eenheid voor een factuurregel. Alleen een groep die volledig uit uren van één soort
 * bestaat krijgt "x uur à y"; zodra er kosten bij zitten is een stuksprijs een verzinsel en wordt
 * het één post.
 */
export function aantalEnEenheid<T extends GroepeerbareBoeking & { aantal: number | null }>(
  boekingen: T[],
): { aantal: number; eenheid: string | null } {
  const alleenUren = boekingen.length > 0 && boekingen.every(b => b.bronType === 'uur')
  const eenSoort = new Set(boekingen.map(soortVan)).size === 1
  if (alleenUren && eenSoort) {
    const uren = rond(boekingen.reduce((s, b) => s + (b.aantal ?? 0), 0))
    if (uren > 0) return { aantal: uren, eenheid: 'uur' }
  }
  return { aantal: 1, eenheid: 'post' }
}
