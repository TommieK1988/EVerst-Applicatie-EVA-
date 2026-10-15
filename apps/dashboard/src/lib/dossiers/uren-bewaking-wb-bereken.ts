import { isCorrectieCode } from '@/components/dossiers/types'

/**
 * De werkbegroting bewaart code én omschrijving in één kostengroep-veld: `"01.A — Peuterhof"`.
 *
 * Splitsen op het eerste scheidingsteken, en de rest **letterlijk** laten staan. Wie op álle
 * scheidingstekens splitst en weer aaneenrijgt, herschrijft een streepje in de omschrijving zelf:
 * `"01.A — Peuterhof - Dobbelaan 9"` werd dan `"Peuterhof — Dobbelaan 9"`, en die code viel niet
 * meer samen met dezelfde code uit Bouw7 — de kiezer toonde hem twee keer.
 */
export function splitsKostengroep(kostengroep: string): { code: string; naam: string | null } {
  const heel = kostengroep.trim()
  const m = /^(.*?)\s[—-]\s(.*)$/.exec(heel)
  if (!m) return { code: heel, naam: null }
  return { code: m[1].trim(), naam: m[2].trim() || null }
}

export type WbRegelInvoer = { id: string; kostengroep: string | null; hoeveelheid: unknown }
export type WbArbeidComponentInvoer = { werkbegroting_regel_id: string; norm_hoeveelheid: unknown; tarief: unknown }

const getal = (v: unknown): number => {
  if (v == null) return 0
  const n = typeof v === 'string' ? parseFloat(v) : Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * Begrote arbeid per bewakingscode uit de werkbegroting.
 *
 * `norm_hoeveelheid` is per eenheid van de regel: een regel van 40 m² met een norm van 0,5 u/m²
 * is 20 uur, niet 0,5. Dus uren = regel.hoeveelheid × norm, bedrag = uren × tarief — dezelfde
 * rekensom als de werkbegroting zelf maakt.
 *
 * De code is het deel vóór het scheidingsteken (`"AW01 — Aangenomen werk"` → `AW01`), zodat hij
 * samenvalt met de code uit Bouw7. Correctiecodes tellen niet mee: dat is geen urenbudget.
 */
export function begroteArbeidPerCode(
  regels: WbRegelInvoer[],
  componenten: WbArbeidComponentInvoer[],
): Map<string, { uren: number; bedrag: number }> {
  const regelPerId = new Map<string, { code: string; hoeveelheid: number }>()
  for (const r of regels) {
    const code = splitsKostengroep(r.kostengroep ?? '').code
    if (!code || isCorrectieCode(code)) continue
    regelPerId.set(r.id, { code, hoeveelheid: getal(r.hoeveelheid) })
  }

  const perCode = new Map<string, { uren: number; bedrag: number }>()
  for (const comp of componenten) {
    const regel = regelPerId.get(comp.werkbegroting_regel_id)
    if (!regel) continue
    const uren = regel.hoeveelheid * getal(comp.norm_hoeveelheid)
    const bedrag = uren * getal(comp.tarief)
    const cur = perCode.get(regel.code) ?? { uren: 0, bedrag: 0 }
    perCode.set(regel.code, { uren: cur.uren + uren, bedrag: cur.bedrag + bedrag })
  }
  return perCode
}
