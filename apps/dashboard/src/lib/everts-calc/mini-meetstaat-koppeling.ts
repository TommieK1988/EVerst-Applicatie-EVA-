// ─── MINI-MEETSTAAT: ÉÉN METING IN MEERDERE REGELS ──────────────────────────
// Het gevelvlak van de voorgevel meet je één keer, bij "Gevel reinigen". Dezelfde maten
// gelden voor "Voegwerk herstellen" (netto) en "Steiger plaatsen" (bruto). In plaats van
// drie keer overtypen koppel je de regels aan één meting.
//
// Er komt geen nieuwe opslagplek bij: elke gekoppelde regel houdt zijn eigen kopie in
// `mini_meetstaat`, met een gedeelde `koppel_id`. Verwijder je één regel, kopieer je het
// scenario of reviseer je de calculatie, dan reist de kopie gewoon mee, en code die van
// koppelen niets weet leest nog steeds een gewone meting.
//
// Gedeeld zijn eenheid, rijen, gemeten_op, naam en koppel_id. Bruto of netto blijft per
// regel: de steiger telt de ramen mee, het voegwerk niet.
//
// Koppelen gebeurt alleen binnen één scenario: de functies hieronder krijgen de regels
// van dat scenario en kijken nergens anders.

import { normaliseerEenheid } from './maat-rekenen'
import { brutoNetto, rijHeeftData, totaalMeting } from './mini-meetstaat'
import type { Calculatieregel, MiniMaatrij, MiniMeting } from './types'

/** Wat deze module van een regel nodig heeft. */
export type RegelMetMeting = Pick<Calculatieregel, 'id' | 'omschrijving' | 'eenheid' | 'mini_meetstaat'>

/**
 * Naam van een meting in de keuzelijst: de eerste gewone rij met een omschrijving
 * ("Gevelvlak voorgevel"), anders de omschrijving van de regel.
 */
export function metingNaam(rijen: MiniMaatrij[], terugval: string): string {
  const eerste = rijen.find(r => !r.aftrek && r.omschrijving.trim())
  return eerste?.omschrijving.trim() || terugval.trim() || 'Meting'
}

const heeftMeting = (r: RegelMetMeting) => (r.mini_meetstaat?.rijen.filter(rijHeeftData).length ?? 0) > 0

/** De andere regels die deze koppeling delen. Zonder koppel_id: geen. */
export function gedeeldMet<R extends RegelMetMeting>(regels: R[], regelId: string, koppelId: string | undefined): R[] {
  if (!koppelId) return []
  return regels.filter(r => r.id !== regelId && r.mini_meetstaat?.koppel_id === koppelId)
}

export interface MetingKeuze {
  /** Sleutel in de keuzelijst: de koppel_id, of de regel-id als de meting nog los is. */
  sleutel: string
  /** Bestaande koppeling; leeg = de bron is nog niet gekoppeld. */
  koppelId?: string
  /** De regel waar de meting vandaan komt. */
  bronRegelId: string
  naam: string
  meting: MiniMeting
  bruto: number
  netto: number
  heeftAftrek: boolean
  /** Omschrijvingen van alle regels met deze meting. */
  regels: string[]
}

/**
 * De metingen uit andere regels van dit scenario die je hier kunt overnemen: alleen in
 * dezelfde eenheid (m2 = m²), en één keer per koppeling. De koppeling waar deze regel
 * zelf al in zit staat er niet in.
 */
export function metingKeuzes(
  regels: RegelMetMeting[], regelId: string, eenheid: string, eigenKoppelId?: string,
): MetingKeuze[] {
  const eenh = normaliseerEenheid(eenheid)
  const keuzes = new Map<string, MetingKeuze>()
  for (const r of regels) {
    const m = r.mini_meetstaat
    if (r.id === regelId || !m || !heeftMeting(r)) continue
    if (normaliseerEenheid(m.eenheid) !== eenh) continue
    if (eigenKoppelId && m.koppel_id === eigenKoppelId) continue
    const sleutel = m.koppel_id ?? r.id
    const bestaand = keuzes.get(sleutel)
    if (bestaand) { bestaand.regels.push(r.omschrijving); continue }
    const rijen = m.rijen.filter(rijHeeftData)
    const bn = brutoNetto(rijen, eenh)
    keuzes.set(sleutel, {
      sleutel,
      koppelId: m.koppel_id,
      bronRegelId: r.id,
      naam: m.naam || metingNaam(rijen, r.omschrijving),
      meting: { ...m, rijen },
      bruto: bn.bruto,
      netto: bn.netto,
      heeftAftrek: bn.heeftAftrek,
      regels: [r.omschrijving],
    })
  }
  return [...keuzes.values()]
}

export interface RegelPatch {
  id: string
  patch: Partial<Calculatieregel>
}

/**
 * Na Overnemen in de dialog: wat de andere regels met dezelfde koppeling krijgen. De
 * regel zelf (`regelId`) zit er niet in; die bewaart de dialog al.
 *
 * Elke gekoppelde regel krijgt de nieuwe rijen, datum en naam, en een hoeveelheid volgens
 * zijn eigen keuze bruto of netto. `bronRegelId` is de regel waar je de meting net uit
 * de keuzelijst hebt gekozen: die had nog geen koppel_id en krijgt hem nu ook.
 *
 * Staat een gekoppelde regel inmiddels in een andere eenheid (met de hand omgezet), dan
 * zijn de maten daar niet meer te lezen. Die regel laat de koppeling los in plaats van
 * een hoeveelheid in de verkeerde eenheid te krijgen.
 */
export function synchroniseerKoppeling(
  regels: RegelMetMeting[], regelId: string, meting: MiniMeting, bronRegelId?: string,
): RegelPatch[] {
  const koppelId = meting.koppel_id
  if (!koppelId) return []
  const eenh = normaliseerEenheid(meting.eenheid)
  const uit: RegelPatch[] = []
  for (const r of regels) {
    if (r.id === regelId) continue
    const eigen = r.mini_meetstaat
    const hoortErbij = eigen?.koppel_id === koppelId || (!!bronRegelId && r.id === bronRegelId)
    if (!hoortErbij) continue
    if (normaliseerEenheid(r.eenheid) !== eenh) {
      if (eigen?.koppel_id) uit.push({ id: r.id, patch: { mini_meetstaat: { ...eigen, koppel_id: undefined } } })
      continue
    }
    const gebruik = eigen?.gebruik ?? 'netto'
    uit.push({
      id: r.id,
      patch: {
        hoeveelheid: totaalMeting(meting.rijen, eenh, gebruik),
        mini_meetstaat: {
          eenheid: meting.eenheid,
          rijen: meting.rijen,
          gemeten_op: meting.gemeten_op,
          naam: meting.naam,
          koppel_id: koppelId,
          gebruik,
        },
      },
    })
  }
  return uit
}

/**
 * Met de hand een andere hoeveelheid typen laat de koppeling los: de meting blijft
 * staan (zodat de dialog de afwijking toont), maar zonder koppel_id. Niet gekoppeld:
 * alleen de hoeveelheid.
 */
export function handmatigeHoeveelheid(regel: RegelMetMeting, hoeveelheid: number): Partial<Calculatieregel> {
  const m = regel.mini_meetstaat
  if (!m?.koppel_id) return { hoeveelheid }
  return { hoeveelheid, mini_meetstaat: { ...m, koppel_id: undefined } }
}
