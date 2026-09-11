/**
 * btw.ts — welk btw-tarief hoort bij een houtrot-werkzaamheid?
 *
 * Pure helpers (geen server-imports), zodat de rapportagebouwer en alles wat er
 * later op leunt dezelfde regels gebruiken.
 *
 * Het tarief komt uit de eenheidsprijs: `paint_items.btw_tarief` is een tekstcode
 * ('hoog' | 'laag' | 'vrijgesteld') uit de calculatiebibliotheek. Die code wordt
 * hier opgezocht in de stamtabel `btw_tarieven`, zodat de rapportage het tarief
 * bij zijn naam kan noemen en verlegde tarieven apart kan optellen.
 *
 * Het gerekende percentage komt uit `heffingsPercentage()` in de stamgegevens —
 * inclusief de bedrijfskeuze dat een verlegd tarief hier zijn nominale percentage
 * heft. Reken dat hier niet opnieuw uit.
 */
import { heffingsPercentage, type BtwTariefKeuze } from '@/lib/stamdata/btw'

/** Waar een tarief vandaan komt. */
export type BtwHerkomst = 'eenheidsprijs' | 'terugval'

export interface BtwUitkomst {
  tarief: BtwTariefKeuze | null
  herkomst: BtwHerkomst
  /** Het percentage dat in rekening wordt gebracht. */
  pct: number
}

/**
 * De tekstcode uit de calculatiebibliotheek naar een nominaal percentage. De
 * bibliotheek kent alleen deze drie; verlegde tarieven bestaan daar niet, dus op
 * een houtrotrapportage komen ze ook niet voor.
 */
const CODE_PCT: Record<string, number> = { hoog: 21, laag: 9, vrijgesteld: 0 }

/** Het niet-verlegde stamtarief met dit percentage. */
function tariefOpPercentage(tarieven: BtwTariefKeuze[], pct: number): BtwTariefKeuze | undefined {
  return tarieven.find(t => !t.verlegd && Number(t.percentage) === pct)
}

/** Bepaalt het tarief van één werkzaamheid uit de code in de eenheidsprijs. */
export function bepaalBtw(
  opties: {
    /** `paint_items.btw_tarief` van dit recept ('hoog' | 'laag' | …). */
    basisCode: string | null | undefined
    tarieven: BtwTariefKeuze[]
  },
): BtwUitkomst {
  const { basisCode, tarieven } = opties
  const code = (basisCode ?? 'hoog').toLowerCase()
  const pct = CODE_PCT[code]
  if (pct !== undefined) {
    const uitLijst = tariefOpPercentage(tarieven, pct)
    if (uitLijst) return { tarief: uitLijst, herkomst: 'eenheidsprijs', pct: heffingsPercentage(uitLijst) }
    // Stamtabel kent dit percentage niet (bv. 0% ontbreekt): het percentage klopt nog wel.
    return { tarief: null, herkomst: 'eenheidsprijs', pct }
  }

  const hoog = tariefOpPercentage(tarieven, 21)
  return hoog
    ? { tarief: hoog, herkomst: 'terugval', pct: heffingsPercentage(hoog) }
    : { tarief: null, herkomst: 'terugval', pct: 21 }
}

/** "21%" / "21% verlegd" — hoe het percentage in de rapportage komt te staan. */
export function pctLabel(u: BtwUitkomst): string {
  const n = Number.isInteger(u.pct) ? String(u.pct) : String(u.pct).replace('.', ',')
  return u.tarief?.verlegd ? `${n}% verlegd` : `${n}%`
}

// ── Btw-opstelling ────────────────────────────────────────────────────────

/** Eén regel van de opstelling onderaan het rapport: alles met hetzelfde tarief. */
export interface BtwGroep {
  /** Sorteersleutel/identiteit: percentage + verlegd-vlag. */
  sleutel: string
  label: string
  pct: number
  verlegd: boolean
  excl: number
  btw: number
  incl: number
}

/**
 * Telt bedragen per tarief op. Verlegd en niet-verlegd blijven gescheiden ook als
 * het percentage gelijk is: ze heten anders en horen apart op de factuur.
 */
export function btwOpstelling(
  regels: { excl: number; uitkomst: BtwUitkomst }[],
): { groepen: BtwGroep[]; excl: number; btw: number; incl: number } {
  const bakken = new Map<string, BtwGroep>()

  for (const r of regels) {
    const verlegd = !!r.uitkomst.tarief?.verlegd
    const sleutel = `${r.uitkomst.pct}|${verlegd ? 'v' : 'n'}`
    let bak = bakken.get(sleutel)
    if (!bak) {
      bak = {
        sleutel,
        label: pctLabel(r.uitkomst),
        pct: r.uitkomst.pct,
        verlegd,
        excl: 0, btw: 0, incl: 0,
      }
      bakken.set(sleutel, bak)
    }
    bak.excl += r.excl
  }

  const rond = (n: number) => Math.round(n * 100) / 100
  const groepen = [...bakken.values()]
    .map(g => {
      const excl = rond(g.excl)
      const btw = rond((excl * g.pct) / 100)
      return { ...g, excl, btw, incl: rond(excl + btw) }
    })
    .sort((a, b) => b.pct - a.pct || Number(a.verlegd) - Number(b.verlegd))

  const excl = rond(groepen.reduce((s, g) => s + g.excl, 0))
  const btw = rond(groepen.reduce((s, g) => s + g.btw, 0))
  return { groepen, excl, btw, incl: rond(excl + btw) }
}
