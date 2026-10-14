import type { Meetregel } from './types'
import { normaliseerEenheid } from './maat-rekenen'

// ─── WEERGAVE VAN DE MEETSTAAT ───────────────────────────────────────────────
// Wat het scherm naast de getallen laat zien: hoe een hoeveelheid tot stand kwam,
// en de totalen per eenheid. Puur, zodat het te testen is zonder het werkgeheugen.

const maat = (n: number) =>
  n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 3 })
const keer = (n: number) =>
  n.toLocaleString('nl-NL', { maximumFractionDigits: 3 })

/**
 * De rekenregel achter een hoeveelheid, zoals de opnemer hem op papier zou zetten:
 * `(2,40×2 + 1,60×2) × 12`, `0,93 × 2,15 × 2 × 12`. Een collega kan zo nakijken hoe
 * een getal tot stand kwam zonder zelf na te rekenen.
 *
 * Leeg als er niets te rekenen valt: één losse maat, één los aantal, of een regel
 * die (nog) niets oplevert. Volgt dezelfde regel als `rekenMaat`.
 */
export function rekenregelTekst(r: Meetregel): string {
  if (r.hoeveelheid_override !== undefined && r.hoeveelheid_override !== null) return 'handmatig'

  const eenheid = normaliseerEenheid(r.eenheid)
  const B = r.breedte || 0
  const H = r.hoogte || 0
  // x (factor) en Aantal; een 1 zegt niets en laten we weg.
  const vermenigvuldigers = [r.factor || 1, r.aantal || 1].filter(n => n !== 1).map(keer)

  let basis: string | null = null
  if (eenheid === 'm¹') {
    const deel = (m: number, n: number | undefined) => (n && n !== 1 ? `${maat(m)}×${keer(n)}` : maat(m))
    const delen = [B > 0 ? deel(B, r.breedte_aantal) : null, H > 0 ? deel(H, r.hoogte_aantal) : null]
      .filter((d): d is string => d !== null)
    if (delen.length === 0) return ''
    basis = delen.length === 2 ? `(${delen.join(' + ')})` : delen[0]
  } else if (eenheid === 'm²') {
    if (B > 0 && H > 0) basis = `${maat(B)} × ${maat(H)}`
    else if (B > 0 || H > 0) return ''   // onvolledig: de rij meldt zelf wat er ontbreekt
  }

  const termen = basis ? [basis, ...vermenigvuldigers] : vermenigvuldigers
  // Eén term zonder bewerking is gewoon het getal zelf; dat staat er al.
  if (termen.length < 2 && !(basis && /[×+]/.test(basis))) return ''
  return termen.join(' × ')
}

/** De totalen per eenheid, in vaste volgorde: m², m¹, dan de rest. */
export function totalenPerEenheid(
  regels: Meetregel[], hoeveelheid: (r: Meetregel) => number,
): { eenheid: string; totaal: number }[] {
  const som = new Map<string, number>()
  for (const r of regels) {
    const h = hoeveelheid(r)
    if (!(h > 0)) continue
    const e = normaliseerEenheid(r.eenheid)
    som.set(e, (som.get(e) ?? 0) + h)
  }
  const rang = (e: string) => (e === 'm²' ? 0 : e === 'm¹' ? 1 : e === 'm³' ? 2 : 3)
  return Array.from(som, ([eenheid, totaal]) => ({ eenheid, totaal }))
    .sort((a, b) => rang(a.eenheid) - rang(b.eenheid) || a.eenheid.localeCompare(b.eenheid))
}

/** '76,71 m² · 200,90 m¹' — leeg als er niets is. */
export function totalenTekst(totalen: { eenheid: string; totaal: number }[]): string {
  return totalen
    .map(t => `${t.totaal.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${t.eenheid}`)
    .join(' · ')
}
