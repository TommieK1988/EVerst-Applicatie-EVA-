/**
 * Verwacht resultaat per bewakingscode — pure rekenregels, geen 'use server' (die mag geen sync
 * exports hebben, en zo is dit los te testen).
 *
 * Alleen stelposten, meerwerk en regie hebben een eigen verkoopbedrag per code. Alle andere codes
 * vallen samen onder de aanneemsom; die komen als één verzamelregel "Aanneemsom (overige codes)"
 * in de tabel, zodat het totaal het resultaat van het hele project is.
 *
 * Kosten zijn overal `max(prognose, geboekt)`: een code die al boven zijn prognose zit, eindigt
 * minstens op wat er geboekt is.
 */

export type ResultaatSoort = 'aanneemsom' | 'stelpost' | 'meerwerk' | 'regie'

/** Hoe het verkoopbedrag tot stand kwam — voor de uitleg in het scherm. */
export type VerkoopGrondslag =
  | 'vast'           // een afgesproken bedrag
  | 'eenheidsprijs'  // eenheidsprijs × werkelijke hoeveelheid
  | 'doorgerekend'   // geboekte verkoopwaarde + nog te verwachten kosten × factor
  | 'mandaat'        // doorgerekend kwam onder het mandaat uit; het mandaat is de ondergrens
  | 'aanneemsom'

export type ResultaatCodeRegel = {
  /** null bij de verzamelregel. */
  code: string | null
  naam: string | null
  soort: ResultaatSoort
  grondslag: VerkoopGrondslag
  verkoop: number
  kosten: number
  geboekteKosten: number
  resultaat: number
  /** resultaat ÷ verkoop in %; null zonder verkoop. */
  margePct: number | null
}

export type ResultaatPerCode = {
  regels: ResultaatCodeRegel[]
  totaal: { verkoop: number; kosten: number; geboekteKosten: number; resultaat: number; margePct: number | null }
  /** Goedgekeurd meerwerk zonder eigen code, meegeteld in de aanneemsomregel. */
  meerwerkZonderCode: number
}

/** Eén bewakingscode uit de Bouw7-bewaking (al opgeteld over de hoofdstukken). */
export type CodeKosten = { code: string; naam: string | null; prognose: number; geboekt: number }

export type StelpostInvoer = {
  bewakingscode: string | null
  omschrijving: string
  bedrag_excl_btw: number | null
  in_opdracht: boolean
  grondslag: 'vast' | 'geboekte_kosten' | 'eenheidsprijzen' | null
  eenheidsprijs: number | null
  hoeveelheid_werkelijk: number | null
  opslag_pct: number | null
}

export type MeerwerkInvoer = {
  bewakingscode: string | null
  omschrijving: string
  status: string
  afrekenwijze: 'regie' | 'aangenomen' | string
  is_stelpost: boolean | null
  stelpost_grondslag: string | null
  bedrag_excl_btw: number | null
  eenheidsprijs: number | null
  hoeveelheid_werkelijk: number | null
  mandaat_excl_btw: number | null
  opdracht_onderdeel_id: string | null
}

export type ResultaatInvoer = {
  /** Alle codes uit de bewaking; code '-' = kosten zonder bewakingscode. */
  codes: CodeKosten[]
  stelposten: StelpostInvoer[]
  meerwerk: MeerwerkInvoer[]
  /** Regiecode van een bon die op regie afrekent; null als het dossier niet op regie loopt. */
  regieCode: string | null
  /** Geboekte verkoopwaarde per code (uren × tarief, kosten × opslag), uit de regie-berekening. */
  verkoopPerCode: Map<string, number>
  /** Geboekte kosten per code zoals de regie-berekening ze telt — de noemer van de factor. */
  inkoopPerCode: Map<string, number>
  /** Orderbasis − alle stelposten (het niet-stelpostwerk); null = geen aanneemsom. */
  aanneemsomBasis: number | null
  /** Bedrijfsstandaard opslag op geboekte kosten, in %. */
  standaardOpslagPct: number
}

const GOEDGEKEURD = new Set(['akkoord', 'voltooid'])

const rond = (n: number): number => Math.round(n * 100) / 100
const getal = (v: unknown): number => {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Wat een code naar verwachting kost: de prognose, of wat er al geboekt is als dat hoger ligt. */
export function verwachteKosten(k: { prognose: number; geboekt: number } | undefined): number {
  if (!k) return 0
  return Math.max(k.prognose, k.geboekt)
}

/**
 * Verkoop van een code die op geboekte kosten afrekent, doorgerekend naar de prognose:
 * wat er al geboekt is in verkoopwaarde, plus de nog te verwachten kosten maal dezelfde factor.
 * De factor is de werkelijke verhouding verkoop/kosten op die code — daar zitten uurtarieven en
 * opslagen al in. Zonder boekingen valt hij terug op 1 + opslag.
 */
export function doorgerekendeVerkoop(invoer: {
  geboekteVerkoop: number
  geboekteInkoop: number
  prognose: number
  geboekt: number
  opslagPct: number
}): number {
  const { geboekteVerkoop, geboekteInkoop, prognose, geboekt, opslagPct } = invoer
  const factor = geboekteInkoop > 0 && geboekteVerkoop > 0
    ? geboekteVerkoop / geboekteInkoop
    : 1 + opslagPct / 100
  return rond(geboekteVerkoop + Math.max(0, prognose - geboekt) * factor)
}

function margeVan(resultaat: number, verkoop: number): number | null {
  return verkoop > 0 ? rond((resultaat / verkoop) * 100) : null
}

export function berekenResultaatPerCode(invoer: ResultaatInvoer): ResultaatPerCode {
  const kostenPerCode = new Map(invoer.codes.map(c => [c.code, c]))

  // Per code het verkoopbedrag verzamelen. Meerdere posten op dezelfde code tellen op; de soort
  // en grondslag van de eerste post blijven staan.
  const perCode = new Map<string, { naam: string | null; soort: ResultaatSoort; grondslag: VerkoopGrondslag; verkoop: number }>()
  const voegToe = (code: string, naam: string | null, soort: ResultaatSoort, grondslag: VerkoopGrondslag, verkoop: number) => {
    const bestaand = perCode.get(code)
    if (bestaand) bestaand.verkoop = rond(bestaand.verkoop + verkoop)
    else perCode.set(code, { naam, soort, grondslag, verkoop: rond(verkoop) })
  }

  const doorgerekend = (code: string, opslagPct: number | null): number => {
    const k = kostenPerCode.get(code)
    return doorgerekendeVerkoop({
      geboekteVerkoop: invoer.verkoopPerCode.get(code) ?? 0,
      geboekteInkoop: invoer.inkoopPerCode.get(code) ?? 0,
      prognose: k?.prognose ?? 0,
      geboekt: k?.geboekt ?? 0,
      opslagPct: opslagPct ?? invoer.standaardOpslagPct,
    })
  }

  // Wat buiten een eigen code valt, gaat naar de aanneemsomregel: daar zitten de kosten ook.
  let losseVerkoop = 0
  let meerwerkZonderCode = 0

  if (invoer.regieCode) {
    voegToe(invoer.regieCode, 'Regie', 'regie', 'doorgerekend', doorgerekend(invoer.regieCode, null))
  }

  for (const s of invoer.stelposten) {
    if (!s.in_opdracht) continue
    const bedrag = getal(s.bedrag_excl_btw)
    if (!s.bewakingscode) { losseVerkoop += bedrag; continue }
    const code = s.bewakingscode

    if (s.grondslag === 'eenheidsprijzen') {
      const heeftHoeveelheid = s.hoeveelheid_werkelijk != null && getal(s.hoeveelheid_werkelijk) !== 0
      voegToe(code, s.omschrijving, 'stelpost', heeftHoeveelheid ? 'eenheidsprijs' : 'vast',
        heeftHoeveelheid ? getal(s.eenheidsprijs) * getal(s.hoeveelheid_werkelijk) : bedrag)
    } else if (s.grondslag === 'geboekte_kosten') {
      // Geen ondergrens: een stelpost verrekent naar beide kanten, dus minder werk is minderwerk.
      // Alleen zolang er nog niets geprognosticeerd of geboekt is, is het stelpostbedrag de beste
      // schatting.
      const k = kostenPerCode.get(code)
      const leeg = !k || (k.prognose === 0 && k.geboekt === 0)
      voegToe(code, s.omschrijving, 'stelpost', leeg ? 'vast' : 'doorgerekend',
        leeg ? bedrag : doorgerekend(code, s.opslag_pct))
    } else {
      voegToe(code, s.omschrijving, 'stelpost', 'vast', bedrag)
    }
  }

  for (const m of invoer.meerwerk) {
    if (!GOEDGEKEURD.has(m.status)) continue
    // Een verrekening van een stelpost: dat verschil zit al in de stelpostregel zelf.
    if (m.opdracht_onderdeel_id != null) continue

    let verkoop: number
    let grondslag: VerkoopGrondslag
    const opGeboekteKosten = m.afrekenwijze === 'regie'
      || (m.is_stelpost === true && m.stelpost_grondslag === 'geboekte_kosten')
    if (m.is_stelpost && m.stelpost_grondslag === 'eenheidsprijzen') {
      verkoop = getal(m.eenheidsprijs) * getal(m.hoeveelheid_werkelijk)
      grondslag = 'eenheidsprijs'
    } else if (opGeboekteKosten) {
      verkoop = m.bewakingscode ? doorgerekend(m.bewakingscode, null) : 0
      grondslag = 'doorgerekend'
      // Zelfde regel als `metMandaat`: zolang er minder verwacht wordt, is het toegezegde bedrag
      // de beste schatting van de opdrachtwaarde.
      if (m.mandaat_excl_btw != null && getal(m.mandaat_excl_btw) > verkoop) {
        verkoop = getal(m.mandaat_excl_btw)
        grondslag = 'mandaat'
      }
    } else {
      verkoop = getal(m.bedrag_excl_btw)
      grondslag = 'vast'
    }

    if (!m.bewakingscode) { meerwerkZonderCode += verkoop; continue }
    voegToe(m.bewakingscode, m.omschrijving, 'meerwerk', grondslag, verkoop)
  }

  const regels: ResultaatCodeRegel[] = []
  for (const [code, v] of perCode) {
    const k = kostenPerCode.get(code)
    const kosten = rond(verwachteKosten(k))
    const resultaat = rond(v.verkoop - kosten)
    regels.push({
      code, naam: k?.naam ?? v.naam, soort: v.soort, grondslag: v.grondslag,
      verkoop: v.verkoop, kosten, geboekteKosten: rond(k?.geboekt ?? 0),
      resultaat, margePct: margeVan(resultaat, v.verkoop),
    })
  }
  const volgorde: Record<ResultaatSoort, number> = { regie: 0, stelpost: 1, meerwerk: 2, aanneemsom: 3 }
  regels.sort((a, b) => volgorde[a.soort] - volgorde[b.soort] || (a.code ?? '').localeCompare(b.code ?? '', 'nl'))

  // Verzamelregel: alle codes zonder eigen verkoop, tegen de aanneemsom. Zonder aanneemsom (een
  // regiebon) is er niets om ze tegen af te zetten; dan tonen we alleen wat er los aan meerwerk is.
  const overig = invoer.codes.filter(c => !perCode.has(c.code))
  const overigeKosten = rond(overig.reduce((s, c) => s + verwachteKosten(c), 0))
  const overigGeboekt = rond(overig.reduce((s, c) => s + c.geboekt, 0))
  const overigeVerkoop = rond((invoer.aanneemsomBasis ?? 0) + losseVerkoop + meerwerkZonderCode)
  if (invoer.aanneemsomBasis != null || overigeVerkoop !== 0) {
    const resultaat = rond(overigeVerkoop - overigeKosten)
    regels.push({
      code: null, naam: 'Aanneemsom (overige codes)', soort: 'aanneemsom', grondslag: 'aanneemsom',
      verkoop: overigeVerkoop, kosten: overigeKosten, geboekteKosten: overigGeboekt,
      resultaat, margePct: margeVan(resultaat, overigeVerkoop),
    })
  }

  const som = (sel: (r: ResultaatCodeRegel) => number) => rond(regels.reduce((s, r) => s + sel(r), 0))
  const verkoop = som(r => r.verkoop)
  const resultaat = som(r => r.resultaat)
  return {
    regels,
    totaal: {
      verkoop, kosten: som(r => r.kosten), geboekteKosten: som(r => r.geboekteKosten),
      resultaat, margePct: margeVan(resultaat, verkoop),
    },
    meerwerkZonderCode: rond(meerwerkZonderCode),
  }
}
