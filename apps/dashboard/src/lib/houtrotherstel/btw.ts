/**
 * btw.ts — welk btw-tarief hoort bij een houtrot-werkzaamheid?
 *
 * Pure helpers (geen server-imports), zodat de dossier-UI, de opdrachtgever-UI én
 * de rapportagebouwer dezelfde regels gebruiken. Zouden die hun eigen keuze maken,
 * dan staat er vroeg of laat een ander percentage op het scherm dan op papier.
 *
 * Voorrang — de meest specifieke afwijking wint:
 *   1. afwijking op het dossier
 *   2. afwijking bij de opdrachtgever
 *   3. de code in de eenheidsprijs (`paint_items.btw_tarief`)
 *   4. Hoog 21%
 *
 * Het gerekende percentage komt uit `heffingsPercentage()` in de stamgegevens —
 * inclusief de bedrijfskeuze dat een verlegd tarief hier zijn nominale percentage
 * heft. Reken dat hier niet opnieuw uit.
 */
import { heffingsPercentage, type BtwTariefKeuze } from '@/lib/stamdata/btw'

/** Afwijking zoals hij in `public.houtrot_btw_tarieven` staat. */
export interface BtwAfwijking {
  recept_id: string
  btw_tarief_id: string
}

/** Waar een tarief vandaan komt — de UI laat zien wat een afwijking overrulet. */
export type BtwHerkomst = 'dossier' | 'opdrachtgever' | 'eenheidsprijs' | 'terugval'

export interface BtwUitkomst {
  tarief: BtwTariefKeuze | null
  herkomst: BtwHerkomst
  /** Het percentage dat in rekening wordt gebracht. */
  pct: number
}

/**
 * De tekstcode uit de calculatiebibliotheek naar een nominaal percentage. De
 * bibliotheek kent alleen deze drie; verlegde tarieven bestaan daar niet en komen
 * dus altijd van een afwijking.
 */
const CODE_PCT: Record<string, number> = { hoog: 21, laag: 9, vrijgesteld: 0 }

/** Het niet-verlegde stamtarief met dit percentage. */
function tariefOpPercentage(tarieven: BtwTariefKeuze[], pct: number): BtwTariefKeuze | undefined {
  return tarieven.find(t => !t.verlegd && Number(t.percentage) === pct)
}

/**
 * Bepaalt het tarief van één werkzaamheid. `receptId` mag leeg zijn (een regel van
 * vóór de receptenkoppeling); dan is er niets om een afwijking aan te hangen en
 * geldt de eenheidsprijs-code.
 */
export function bepaalBtw(
  opties: {
    receptId: string | null | undefined
    /** `paint_items.btw_tarief` van dit recept ('hoog' | 'laag' | …). */
    basisCode: string | null | undefined
    dossier: Map<string, string>
    opdrachtgever: Map<string, string>
    tarieven: BtwTariefKeuze[]
  },
): BtwUitkomst {
  const { receptId, basisCode, dossier, opdrachtgever, tarieven } = opties
  const opId = (id: string | undefined) => (id ? tarieven.find(t => t.id === id) : undefined)

  if (receptId) {
    const uitDossier = opId(dossier.get(receptId))
    if (uitDossier) return { tarief: uitDossier, herkomst: 'dossier', pct: heffingsPercentage(uitDossier) }
    const uitKlant = opId(opdrachtgever.get(receptId))
    if (uitKlant) return { tarief: uitKlant, herkomst: 'opdrachtgever', pct: heffingsPercentage(uitKlant) }
  }

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

/** Afwijkingenlijst → opzoekkaart recept_id → btw_tarief_id. */
export function naarKaart(rijen: BtwAfwijking[]): Map<string, string> {
  return new Map(rijen.map(r => [r.recept_id, r.btw_tarief_id]))
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
