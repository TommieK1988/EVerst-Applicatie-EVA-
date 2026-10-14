// ─── MAAT REKENEN ────────────────────────────────────────────────────────────
// De ene rekenregel van maat naar hoeveelheid. De meetstaat (en daarmee de
// afdruk) en de mini-meetstaat in de calculatie rekenen hier allebei mee, zodat
// dezelfde maten op beide plekken hetzelfde getal opleveren.

/**
 * Schrijft de varianten uit de bibliotheek ('m2', 'M1 ') op één manier. Zonder dit
 * telt 'm2' als een eigen eenheid naast 'm²' en splitst een totaal in tweeën.
 */
export function normaliseerEenheid(eenheid: string | undefined | null): string {
  const e = (eenheid ?? '').trim()
  const klein = e.toLowerCase()
  if (klein === 'm2') return 'm²'
  if (klein === 'm1') return 'm¹'
  if (klein === 'm3') return 'm³'
  return e
}

export interface Maatinvoer {
  eenheid: string | undefined | null
  breedte?: number
  hoogte?: number
  /** Derde maat; alleen bij m³. */
  diepte?: number
  /** Hoeveel breedtes je meet; alleen bij m¹ (leeg = 1). */
  breedte_aantal?: number
  /** Hoeveel hoogtes je meet; alleen bij m¹ (leeg = 1). */
  hoogte_aantal?: number
  factor?: number
  aantal?: number
}

/**
 *   m¹  = ((breedte × breedte-aantal) + (hoogte × hoogte-aantal)) × factor × aantal
 *   m²  = breedte × hoogte × factor × aantal
 *   m³  = breedte × hoogte × diepte × factor × aantal
 *   rest (st, post, uur …) = factor × aantal
 *
 * Leeg én 0 tellen bij factor en aantal als 1: een lege cel mag een regel nooit
 * stil op nul zetten.
 *
 * Bij m² en m³ zonder enige maat telt alleen factor × aantal; zo geef je een bekend
 * oppervlak direct op. Ontbreekt er één maat van een vlak (wel breedte, geen hoogte),
 * dan is de regel onvolledig en levert hij 0 op. Vroeger telde zo'n regel als
 * 'alleen aantal': 12,60 m breed zonder hoogte werd stil 1 m².
 */
export function rekenMaat(m: Maatinvoer): number {
  const eenheid = normaliseerEenheid(m.eenheid)
  const B = m.breedte || 0
  const H = m.hoogte || 0
  const D = m.diepte || 0
  const N = (m.aantal || 1) * (m.factor || 1)

  let uitkomst: number
  if (eenheid === 'm¹') {
    uitkomst = (B * (m.breedte_aantal || 1) + H * (m.hoogte_aantal || 1)) * N
  } else if (eenheid === 'm²') {
    uitkomst = vlak([B, H], N)
  } else if (eenheid === 'm³') {
    uitkomst = vlak([B, H, D], N)
  } else {
    uitkomst = N
  }
  return +uitkomst.toFixed(4)
}

/** Alle maten ingevuld: hun product. Geen enkele: alleen het aantal. Half: 0. */
function vlak(maten: number[], N: number): number {
  const ingevuld = maten.filter(x => x > 0).length
  if (ingevuld === 0) return N
  if (ingevuld < maten.length) return 0
  return maten.reduce((p, x) => p * x, 1) * N
}

/**
 * Welke maat ontbreekt er aan een onvolledige m²- of m³-regel? Leeg als de regel
 * compleet is of niets met vlakken te maken heeft. Voor de waarschuwing in de rij.
 */
export function ontbrekendeMaat(m: Maatinvoer): string | null {
  const eenheid = normaliseerEenheid(m.eenheid)
  const maten: [string, number][] =
    eenheid === 'm²' ? [['breedte', m.breedte || 0], ['hoogte', m.hoogte || 0]]
    : eenheid === 'm³' ? [['breedte', m.breedte || 0], ['hoogte', m.hoogte || 0], ['diepte', m.diepte || 0]]
    : []
  const leeg = maten.filter(([, x]) => !(x > 0)).map(([naam]) => naam)
  if (leeg.length === 0 || leeg.length === maten.length) return null
  return leeg.join(' en ')
}
