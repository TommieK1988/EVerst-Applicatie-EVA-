import type { CalculatieLijn, Activiteit, Scenario, ProjectTotalen, BtwGroep, Groep, Calculatieregel, Componentregel, ComponentType, WerkbegrotingRegel, WerkbegrotingComponent } from './types'

// ─── Lijn berekeningen ────────────────────────────────────────────────────────

export function berekenLijnTotaal(lijn: CalculatieLijn): number {
  return lijn.hoeveelheid * lijn.eenheidsprijs * lijn.verliesfactor
}

// ─── Activiteit berekeningen ──────────────────────────────────────────────────

export function berekenActiviteitKostprijs(
  activiteit: Activiteit,
  lijnen: CalculatieLijn[]
): number {
  const lijnTotaal = lijnen.reduce((som, lijn) => som + berekenLijnTotaal(lijn), 0)
  return lijnTotaal * activiteit.hoeveelheid
}

// ─── Project totalen ──────────────────────────────────────────────────────────

/** Bereken BTW per tarief op basis van individuele calculatieregels */
export function berekenBtwBreakdown(
  regels: Calculatieregel[],
  componenten: Componentregel[],
  defaultOpslag: number,
  btwDefault: number
): BtwGroep[] {
  const groepen = new Map<number, number>()
  for (const r of regels) {
    const opslag = r.opslag_pct ?? defaultOpslag
    const { vp_totaal } = berekenCalculatieregel(r, componenten, opslag)
    if (vp_totaal === 0) continue
    const pct = r.btw_pct ?? btwDefault
    groepen.set(pct, (groepen.get(pct) ?? 0) + vp_totaal)
  }
  return Array.from(groepen.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([pct, basis]) => ({ pct, basis, btw: basis * (pct / 100) }))
}

export function berekenProjectTotalen(
  kostprijs: number,
  scenario: Scenario,
  regels?: Calculatieregel[],
  componenten?: Componentregel[]
): ProjectTotalen {
  const opslag_ak = kostprijs * (scenario.opslag_algemene_kosten / 100)
  const na_ak = kostprijs + opslag_ak
  const opslag_wr = na_ak * (scenario.opslag_winst_risico / 100)
  const na_wr = na_ak + opslag_wr
  const opslag_overhead = na_wr * (scenario.opslag_overhead / 100)
  const verkoopprijs = na_wr + opslag_overhead

  const defaultOpslag = scenario.opslag_algemene_kosten + scenario.opslag_winst_risico
  const btwDefault = scenario.btw_pct_default ?? 0

  // Bereken BTW per tarief op basis van individuele regels
  let btw_groepen: BtwGroep[]
  if (regels && componenten && regels.length > 0) {
    btw_groepen = berekenBtwBreakdown(regels, componenten, defaultOpslag, btwDefault)
  } else {
    const btw_pct = btwDefault
    btw_groepen = [{ pct: btw_pct, basis: verkoopprijs, btw: verkoopprijs * (btw_pct / 100) }]
  }

  const btw = btw_groepen.reduce((s, g) => s + g.btw, 0)
  const totaal_incl = verkoopprijs + btw
  const marge_euro = verkoopprijs - kostprijs
  const marge_pct = verkoopprijs > 0 ? (marge_euro / verkoopprijs) * 100 : 0

  return {
    kostprijs,
    opslag_ak,
    opslag_wr,
    opslag_overhead,
    verkoopprijs,
    btw,
    btw_groepen,
    totaal_incl,
    marge_euro,
    marge_pct,
  }
}

// ─── Formatters ───────────────────────────────────────────────────────────────

export function formatEuro(bedrag: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(bedrag)
}

export function formatPct(pct: number): string {
  return `${pct.toFixed(1)}%`
}

export function formatGetal(getal: number, decimalen = 2): string {
  return new Intl.NumberFormat('nl-NL', {
    minimumFractionDigits: decimalen,
    maximumFractionDigits: decimalen,
  }).format(getal)
}

/**
 * Leest een met de hand getypt getal, in Nederlandse én Engelse notatie.
 *
 * Staan er punt én komma in ("1.234,56"), dan is de punt het duizendteken en de
 * komma het decimaalteken. Staat er maar één van beide ("1234,5" of "1234.5"),
 * dan is dat het decimaalteken — anders zou iemand die gewoon "12.5" typt ineens
 * 125 krijgen. Onleesbare invoer levert 0 op.
 */
export function parseGetal(tekst: string): number {
  const schoon = tekst.replace(/[\s €]/g, '')
  if (!schoon) return 0
  const genormaliseerd = schoon.includes(',') && schoon.includes('.')
    ? schoon.replace(/\./g, '').replace(',', '.')
    : schoon.replace(',', '.')
  const n = parseFloat(genormaliseerd)
  return Number.isFinite(n) ? n : 0
}

// ─── Nieuwe calculatiestructuur: berekenlogica ────────────────────────────────

export interface RegelBedragen {
  arbeid_pe: number;    arbeid_totaal: number
  materieel_pe: number; materieel_totaal: number
  oa_pe: number;        oa_totaal: number
  kp_pe: number;        kp_totaal: number
  uren_pe: number;      uren_totaal: number; min_pe: number
  vp_pe: number;        vp_totaal: number
  arbeid_vp: number;    materieel_vp: number;    oa_vp: number
}

export function berekenCalculatieregel(
  regel: Calculatieregel,
  componenten: Componentregel[],
  opslag_pct = 0
): RegelBedragen {
  const getAll = (type: ComponentType) =>
    componenten.filter(c => c.calculatieregel_id === regel.id && c.type === type)

  const abs = getAll('arbeid')
  const mts = getAll('materieel')
  const oas = getAll('onderaanneming')

  const arbeid_pe    = abs.reduce((s, c) => s + (c.norm_hoeveelheid ?? 0) * (c.tarief ?? 0), 0)
  const materieel_pe = mts.reduce((s, c) => s + (c.norm_hoeveelheid ?? 0) * (c.tarief ?? 0), 0)
  const oa_pe        = oas.reduce((s, c) => s + (c.norm_hoeveelheid ?? 0) * (c.tarief ?? 0), 0)
  const kp_pe        = arbeid_pe + materieel_pe + oa_pe
  const uren_pe      = abs.reduce((s, c) => s + (c.norm_hoeveelheid ?? 0), 0)
  const min_pe       = uren_pe * 60
  // Per-component VP met eigen opslag_pct (fallback naar calculatieregel opslag_pct)
  const arbeid_vp = abs.reduce((s, c) => {
    const pct = c.opslag_pct ?? opslag_pct
    return s + (c.norm_hoeveelheid ?? 0) * (c.tarief ?? 0) * regel.hoeveelheid * (1 + pct / 100)
  }, 0)
  const materieel_vp = mts.reduce((s, c) => {
    const pct = c.opslag_pct ?? opslag_pct
    return s + (c.norm_hoeveelheid ?? 0) * (c.tarief ?? 0) * regel.hoeveelheid * (1 + pct / 100)
  }, 0)
  const oa_vp = oas.reduce((s, c) => {
    const pct = c.opslag_pct ?? opslag_pct
    return s + (c.norm_hoeveelheid ?? 0) * (c.tarief ?? 0) * regel.hoeveelheid * (1 + pct / 100)
  }, 0)
  const vp_totaal = arbeid_vp + materieel_vp + oa_vp
  const vp_pe     = regel.hoeveelheid > 0 ? vp_totaal / regel.hoeveelheid : 0

  return {
    arbeid_pe,    arbeid_totaal:    arbeid_pe    * regel.hoeveelheid,
    materieel_pe, materieel_totaal: materieel_pe * regel.hoeveelheid,
    oa_pe,        oa_totaal:        oa_pe        * regel.hoeveelheid,
    kp_pe,        kp_totaal:        kp_pe        * regel.hoeveelheid,
    uren_pe,      uren_totaal:      uren_pe      * regel.hoeveelheid, min_pe,
    vp_pe,        vp_totaal,
    arbeid_vp,    materieel_vp,     oa_vp,
  }
}

export function berekenGroepKostprijs(
  groepId: string,
  alleGroepen: Groep[],
  alleRegels: Calculatieregel[],
  alleComponenten: Componentregel[]
): number {
  const directeRegels = alleRegels.filter(r => r.groep_id === groepId)
  const regelSom = directeRegels.reduce((s, r) => {
    const { kp_totaal } = berekenCalculatieregel(r, alleComponenten)
    return s + kp_totaal
  }, 0)
  const subGroepen = alleGroepen.filter(g => g.parent_id === groepId)
  const subSom = subGroepen.reduce(
    (s, g) => s + berekenGroepKostprijs(g.id, alleGroepen, alleRegels, alleComponenten), 0
  )
  return regelSom + subSom
}

/**
 * Berekent de verkoopprijs van een groep (en subgroepen) als som van
 * individuele regel-VPs — elk met zijn eigen opslag_pct.
 */
export function berekenGroepVP(
  groepId: string,
  alleGroepen: Groep[],
  alleRegels: Calculatieregel[],
  alleComponenten: Componentregel[],
  defaultOpslag: number
): number {
  const directeRegels = alleRegels.filter(r => r.groep_id === groepId)
  const regelSom = directeRegels.reduce((s, r) => {
    const opslag = r.opslag_pct ?? defaultOpslag
    const { vp_totaal } = berekenCalculatieregel(r, alleComponenten, opslag)
    return s + vp_totaal
  }, 0)
  const subGroepen = alleGroepen.filter(g => g.parent_id === groepId)
  const subSom = subGroepen.reduce(
    (s, g) => s + berekenGroepVP(g.id, alleGroepen, alleRegels, alleComponenten, defaultOpslag), 0
  )
  return regelSom + subSom
}

export function berekenGroepUren(
  groepId: string,
  alleGroepen: Groep[],
  alleRegels: Calculatieregel[],
  alleComponenten: Componentregel[]
): number {
  const directeRegels = alleRegels.filter(r => r.groep_id === groepId)
  const regelSom = directeRegels.reduce((s, r) => {
    const { uren_totaal } = berekenCalculatieregel(r, alleComponenten)
    return s + uren_totaal
  }, 0)
  const subGroepen = alleGroepen.filter(g => g.parent_id === groepId)
  const subSom = subGroepen.reduce(
    (s, g) => s + berekenGroepUren(g.id, alleGroepen, alleRegels, alleComponenten), 0
  )
  return regelSom + subSom
}

export function berekenGroepMaterieel(
  groepId: string,
  alleGroepen: Groep[],
  alleRegels: Calculatieregel[],
  alleComponenten: Componentregel[]
): number {
  const directeRegels = alleRegels.filter(r => r.groep_id === groepId)
  const regelSom = directeRegels.reduce((s, r) => {
    const { materieel_totaal } = berekenCalculatieregel(r, alleComponenten)
    return s + materieel_totaal
  }, 0)
  const subGroepen = alleGroepen.filter(g => g.parent_id === groepId)
  const subSom = subGroepen.reduce(
    (s, g) => s + berekenGroepMaterieel(g.id, alleGroepen, alleRegels, alleComponenten), 0
  )
  return regelSom + subSom
}

export function berekenGroepOA(
  groepId: string,
  alleGroepen: Groep[],
  alleRegels: Calculatieregel[],
  alleComponenten: Componentregel[]
): number {
  const directeRegels = alleRegels.filter(r => r.groep_id === groepId)
  const regelSom = directeRegels.reduce((s, r) => {
    const { oa_totaal } = berekenCalculatieregel(r, alleComponenten)
    return s + oa_totaal
  }, 0)
  const subGroepen = alleGroepen.filter(g => g.parent_id === groepId)
  const subSom = subGroepen.reduce(
    (s, g) => s + berekenGroepOA(g.id, alleGroepen, alleRegels, alleComponenten), 0
  )
  return regelSom + subSom
}

export function berekenScenarioKostprijs(
  alleGroepen: Groep[],
  alleRegels: Calculatieregel[],
  alleComponenten: Componentregel[]
): number {
  return alleGroepen
    .filter(g => g.parent_id === null)
    .reduce((s, g) => s + berekenGroepKostprijs(g.id, alleGroepen, alleRegels, alleComponenten), 0)
}

/**
 * Berekent de totale verkoopprijs als som van individuele regel-VPs.
 * Elk regel gebruikt zijn eigen opslag_pct (fallback: defaultOpslag).
 * Dit is de leidende VP-berekening — niet de scenario-opslagen.
 */
export function berekenScenarioVP(
  alleGroepen: Groep[],
  alleRegels: Calculatieregel[],
  alleComponenten: Componentregel[],
  defaultOpslag: number
): number {
  const groepIds = new Set(alleGroepen.map(g => g.id))
  return alleRegels
    .filter(r => groepIds.has(r.groep_id))
    .reduce((s, r) => {
      const opslag = r.opslag_pct ?? defaultOpslag
      const { vp_totaal } = berekenCalculatieregel(r, alleComponenten, opslag)
      return s + vp_totaal
    }, 0)
}

/** Automatisch nummers berekenen op basis van boomvolgorde */
export function berekeningNummers(groepen: Groep[]): Map<string, string> {
  const nummers = new Map<string, string>()
  const sorted = (parentId: string | null) =>
    groepen.filter(g => g.parent_id === parentId).sort((a, b) => a.volgorde - b.volgorde)

  sorted(null).forEach((g1, i) => {
    const n1 = String(i + 1)
    nummers.set(g1.id, n1)
    sorted(g1.id).forEach((g2, j) => {
      const n2 = `${n1}.${j + 1}`
      nummers.set(g2.id, n2)
      sorted(g2.id).forEach((g3, k) => {
        nummers.set(g3.id, `${n2}.${k + 1}`)
      })
    })
  })
  return nummers
}

// ─── Werkbegroting berekeningen ───────────────────────────────────────────────

/** Identieke logica als berekenCalculatieregel, maar voor WerkbegrotingComponent[]. */
export function berekenWerkbegrotingRegel(
  regel: WerkbegrotingRegel,
  componenten: WerkbegrotingComponent[],
  opslag_pct = 0
): RegelBedragen {
  const getAll = (type: ComponentType) =>
    componenten.filter(c => c.werkbegroting_regel_id === regel.id && c.type === type)

  const abs = getAll('arbeid')
  const mts = getAll('materieel')
  const oas = getAll('onderaanneming')

  const arbeid_pe    = abs.reduce((s, c) => s + (c.norm_hoeveelheid ?? 0) * (c.tarief ?? 0), 0)
  const materieel_pe = mts.reduce((s, c) => s + (c.norm_hoeveelheid ?? 0) * (c.tarief ?? 0), 0)
  const oa_pe        = oas.reduce((s, c) => s + (c.norm_hoeveelheid ?? 0) * (c.tarief ?? 0), 0)
  const kp_pe        = arbeid_pe + materieel_pe + oa_pe
  const uren_pe      = abs.reduce((s, c) => s + (c.norm_hoeveelheid ?? 0), 0)
  const min_pe       = uren_pe * 60

  const arbeid_vp = abs.reduce((s, c) => {
    const pct = c.opslag_pct ?? opslag_pct
    return s + (c.norm_hoeveelheid ?? 0) * (c.tarief ?? 0) * regel.hoeveelheid * (1 + pct / 100)
  }, 0)
  const materieel_vp = mts.reduce((s, c) => {
    const pct = c.opslag_pct ?? opslag_pct
    return s + (c.norm_hoeveelheid ?? 0) * (c.tarief ?? 0) * regel.hoeveelheid * (1 + pct / 100)
  }, 0)
  const oa_vp = oas.reduce((s, c) => {
    const pct = c.opslag_pct ?? opslag_pct
    return s + (c.norm_hoeveelheid ?? 0) * (c.tarief ?? 0) * regel.hoeveelheid * (1 + pct / 100)
  }, 0)
  const vp_totaal = arbeid_vp + materieel_vp + oa_vp
  const vp_pe     = regel.hoeveelheid > 0 ? vp_totaal / regel.hoeveelheid : 0

  return {
    arbeid_pe,    arbeid_totaal:    arbeid_pe    * regel.hoeveelheid,
    materieel_pe, materieel_totaal: materieel_pe * regel.hoeveelheid,
    oa_pe,        oa_totaal:        oa_pe        * regel.hoeveelheid,
    kp_pe,        kp_totaal:        kp_pe        * regel.hoeveelheid,
    uren_pe,      uren_totaal:      uren_pe      * regel.hoeveelheid, min_pe,
    vp_pe,        vp_totaal,
    arbeid_vp,    materieel_vp,     oa_vp,
  }
}

/** Vergelijkt de werkbegroting KP met de originele calculatie KP voor één regel. */
export function vergelijkMetCalculatie(
  wbRegel: WerkbegrotingRegel,
  wbComponenten: WerkbegrotingComponent[],
  origRegel: Calculatieregel,
  origComponenten: Componentregel[]
): { kp_verschil: number; kp_verschil_pct: number; gewijzigd: boolean } {
  const { kp_totaal: wbKP } = berekenWerkbegrotingRegel(wbRegel, wbComponenten)
  const { kp_totaal: origKP } = berekenCalculatieregel(origRegel, origComponenten)
  const kp_verschil = wbKP - origKP  // negatief = besparing
  const kp_verschil_pct = origKP !== 0 ? (kp_verschil / origKP) * 100 : 0
  const gewijzigd = Math.abs(kp_verschil) > 0.001
  return { kp_verschil, kp_verschil_pct, gewijzigd }
}

// ─── Houtrot berekeningen ─────────────────────────────────────────────────────

export interface HoutrotBerekening {
  methode: 'epoxy' | 'deelvervanging' | 'lamineren'
  oppervlak_cm2: number
  ernst: 'licht' | 'matig' | 'ernstig'
  uurtarief_timmerman: number
}

export function berekenHoutrotKosten(config: HoutrotBerekening): {
  arbeid_uren: number
  arbeid_kosten: number
  materiaal_kosten: number
  totaal: number
  regels: { omschrijving: string; hoeveelheid: number; eenheid: string; prijs: number; totaal: number }[]
} {
  const { methode, oppervlak_cm2, ernst, uurtarief_timmerman } = config
  const regels = []

  if (methode === 'epoxy') {
    const sets = Math.ceil(oppervlak_cm2 / 50)
    const uren = ernst === 'licht' ? 0.5 : ernst === 'matig' ? 0.75 : 1.25
    const arbeid = uren * uurtarief_timmerman
    const materiaal = sets * 24.5
    regels.push({ omschrijving: 'Timmerman', hoeveelheid: uren, eenheid: 'uur', prijs: uurtarief_timmerman, totaal: arbeid })
    regels.push({ omschrijving: 'Epoxy set', hoeveelheid: sets, eenheid: 'set', prijs: 24.5, totaal: materiaal })
    return { arbeid_uren: uren, arbeid_kosten: arbeid, materiaal_kosten: materiaal, totaal: arbeid + materiaal, regels }
  }

  if (methode === 'deelvervanging') {
    const ml = Math.ceil(oppervlak_cm2 / 68 / 10) * 10 / 10 // cm² → m¹ maat
    const uren = ernst === 'licht' ? 1.0 : ernst === 'matig' ? 1.5 : 2.5
    const arbeid = uren * uurtarief_timmerman
    const lat_prijs = 8.2
    const kit_prijs = 4.5
    const materiaal = ml * lat_prijs + kit_prijs
    regels.push({ omschrijving: 'Timmerman', hoeveelheid: uren, eenheid: 'uur', prijs: uurtarief_timmerman, totaal: arbeid })
    regels.push({ omschrijving: 'Meranti lat 38x68', hoeveelheid: ml, eenheid: 'm¹', prijs: lat_prijs, totaal: ml * lat_prijs })
    regels.push({ omschrijving: 'Kit + schroeven', hoeveelheid: 1, eenheid: 'set', prijs: kit_prijs, totaal: kit_prijs })
    return { arbeid_uren: uren, arbeid_kosten: arbeid, materiaal_kosten: materiaal, totaal: arbeid + materiaal, regels }
  }

  // lamineren
  const sets = Math.ceil(oppervlak_cm2 / 100)
  const uren = ernst === 'licht' ? 0.75 : ernst === 'matig' ? 1.25 : 2.0
  const arbeid = uren * uurtarief_timmerman
  const lamineer_prijs = 35.0
  const materiaal = sets * lamineer_prijs
  regels.push({ omschrijving: 'Timmerman', hoeveelheid: uren, eenheid: 'uur', prijs: uurtarief_timmerman, totaal: arbeid })
  regels.push({ omschrijving: 'Lamineer set (glasvezel)', hoeveelheid: sets, eenheid: 'set', prijs: lamineer_prijs, totaal: materiaal })
  return { arbeid_uren: uren, arbeid_kosten: arbeid, materiaal_kosten: materiaal, totaal: arbeid + materiaal, regels }
}

