/**
 * Verwacht resultaat per post — pure rekenregels, geen 'use server' (die mag geen sync exports
 * hebben, en zo is dit los te testen).
 *
 * Eén regel per onderdeel van de opdracht: de hoofdopdracht, elke stelpost en elke goedgekeurde
 * meerwerkregel. Stelposten die ín de aanneemsom zitten staan onder de hoofdopdracht; aanvullende
 * stelposten onder het meerwerk.
 *
 * Kosten (de prognose) komen per bewakingscode uit Bouw7. Een post krijgt de kosten van de code
 * waar hij op staat; delen meerdere posten één code, dan naar verhouding van hun verkoop. Een post
 * zonder code heeft geen eigen prognose: zijn kosten staan op de gewone codes, dus bij de
 * hoofdopdracht. Die krijgt alle codes zonder eigen post; welke daarvan aan de Hoofdopdracht
 * gekoppeld zijn (`bewakingscode_koppelingen`) bepaalt alleen de indeling eronder, nooit het bedrag.
 *
 * De prognose is de kostprijs uit de werkbegroting per bewakingscode. Een dossier zonder
 * werkbegroting valt terug op de prognose uit de Bouw7-bewaking.
 */

export type PostSoort = 'hoofd' | 'regie' | 'stelpost' | 'optie' | 'meerwerk'

/** Hoe het verkoopbedrag tot stand kwam — voor de uitleg in het scherm. */
export type VerkoopGrondslag =
  | 'vast'           // een afgesproken bedrag
  | 'eenheidsprijs'  // eenheidsprijs × werkelijke hoeveelheid
  | 'doorgerekend'   // geboekte verkoopwaarde + nog te verwachten kosten × factor
  | 'mandaat'        // doorgerekend kwam onder het mandaat uit; het mandaat is de ondergrens
  | 'verrekend'      // stelpostbedrag + de verrekening op het tabblad Meerwerk
  | 'geboekt'        // de geboekte verkoopwaarde ligt al boven het stelpostbedrag
  | 'aanneemsom'

export type ResultaatPost = {
  sleutel: string
  /** De bewakingscode waar de kosten staan; null = geen eigen prognose. */
  code: string | null
  omschrijving: string
  soort: PostSoort
  grondslag: VerkoopGrondslag
  verkoop: number
  prognose: number | null
  resultaat: number | null
  /** resultaat ÷ verkoop in %; null zonder verkoop of zonder prognose. */
  margePct: number | null
  /** Deel van de kosten van de code dat bij deze post hoort (0–1); null = de hele code. */
  kostenAandeel: number | null
  /** Alleen op de hoofdopdracht: de bewakingscodes waaruit zijn prognose bestaat. */
  onderdelen?: HoofdOnderdeel[]
}

/**
 * Eén bewakingscode onder de hoofdopdracht. `prognose` is precies het bedrag waarmee de code in de
 * prognose van de hoofdopdracht zit (onafgerond, zodat de som exact sluit). `gekoppeld` is alleen
 * de indeling: gekoppeld aan de Hoofdopdracht, of nog niet.
 */
export type HoofdOnderdeel = {
  code: string
  naam: string | null
  hoofdstuk: string | null
  prognose: number
  gekoppeld: boolean
}

/**
 * Prognose, resultaat en marge tellen alleen de posten mét een prognose; de verkoop alles.
 * `zonderPrognose` = het aantal posten zonder eigen prognose.
 */
export type Subtotaal = {
  verkoop: number
  prognose: number | null
  resultaat: number | null
  margePct: number | null
  zonderPrognose: number
}

export type ResultaatPerPost = {
  aanneemsom: {
    regie: ResultaatPost | null
    hoofd: ResultaatPost | null
    stelposten: ResultaatPost[]
    opties: ResultaatPost[]
    subtotaalStelposten: Subtotaal
    subtotaal: Subtotaal
  }
  meerwerk: { posten: ResultaatPost[]; subtotaal: Subtotaal }
  /** Verkoop en prognose van alles; resultaat = verkoop − prognose (het projectresultaat). */
  totaal: { verkoop: number; prognose: number; resultaat: number; margePct: number | null }
  prognoseBron: PrognoseBron
}

/** Waar de prognose vandaan komt: de werkbegroting van het dossier, of (zonder) Bouw7. */
export type PrognoseBron = 'werkbegroting' | 'bouw7'

/**
 * Eén bewakingscode. `prognose` = de kosten uit de werkbegroting (of Bouw7 zonder werkbegroting);
 * `geboekt` komt uit de Bouw7-bewaking. `begroot` en `meerwerk` zijn de twee budgetdelen in Bouw7;
 * samen bepalen ze hoe de kosten van een code die zowel aanneemsom- als meerwerk draagt worden
 * verdeeld.
 */
export type CodeKosten = {
  code: string; naam: string | null; prognose: number; geboekt: number
  begroot?: number; meerwerk?: number
  /** Bouw7-hoofdstuk(ken) waarin de code staat, alleen voor de weergave. */
  hoofdstuk?: string | null
}

export type StelpostInvoer = {
  id: string
  bewakingscode: string | null
  omschrijving: string
  bedrag_excl_btw: number | null
  in_opdracht: boolean
  /** true = zit in de aanneemsom (carve-out); false = aanvullend, staat onder het meerwerk. */
  in_aanneemsom: boolean
  grondslag: 'vast' | 'geboekte_kosten' | 'eenheidsprijzen' | null
  eenheidsprijs: number | null
  hoeveelheid_werkelijk: number | null
  opslag_pct: number | null
}

export type MeerwerkInvoer = {
  id: string
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
  /** Bestaande code waar de kosten staan, voor meerwerk zonder eigen `bewakingscode`. */
  kosten_bewakingscode?: string | null
}

export type OptieInvoer = { id: string; omschrijving: string; bedrag_excl_btw: number | null }

export type ResultaatInvoer = {
  /** Alle codes uit de bewaking; code '-' = kosten zonder bewakingscode. */
  codes: CodeKosten[]
  stelposten: StelpostInvoer[]
  meerwerk: MeerwerkInvoer[]
  /** Opties die in de opdracht zitten. */
  opties?: OptieInvoer[]
  /** Regiecode van een bon die op regie afrekent; null als het dossier niet op regie loopt. */
  regieCode: string | null
  /** Geboekte verkoopwaarde per code (uren × tarief, kosten × opslag), uit de regie-berekening. */
  verkoopPerCode: Map<string, number>
  /** Geboekte kosten per code zoals de regie-berekening ze telt — de noemer van de factor. */
  inkoopPerCode: Map<string, number>
  /** Aanneemsom − de stelposten die erin zitten; null = geen aanneemsom. */
  aanneemsomBasis: number | null
  /** Aan de Hoofdopdracht gekoppelde bewakingscodes — alleen voor de indeling. */
  gekoppeld?: Set<string>
  /** Bedrijfsstandaard opslag op geboekte kosten, in %. */
  standaardOpslagPct: number
  prognoseBron?: PrognoseBron
}

const GOEDGEKEURD = new Set(['akkoord', 'voltooid'])

const rond = (n: number): number => Math.round(n * 100) / 100
const getal = (v: unknown): number => {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v)
  return Number.isFinite(n) ? n : 0
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

export function subtotaalVan(posten: ResultaatPost[]): Subtotaal {
  const met = posten.filter(p => p.prognose != null)
  const verkoop = rond(posten.reduce((s, p) => s + p.verkoop, 0))
  if (met.length === 0) return { verkoop, prognose: null, resultaat: null, margePct: null, zonderPrognose: posten.length }
  const prognose = rond(met.reduce((s, p) => s + (p.prognose ?? 0), 0))
  const resultaat = rond(met.reduce((s, p) => s + (p.resultaat ?? 0), 0))
  return {
    verkoop, prognose, resultaat,
    margePct: margeVan(resultaat, rond(met.reduce((s, p) => s + p.verkoop, 0))),
    zonderPrognose: posten.length - met.length,
  }
}

type Groep = 'regie' | 'stelpost' | 'optie' | 'meerwerk'
type Concept = Omit<ResultaatPost, 'prognose' | 'resultaat' | 'margePct' | 'kostenAandeel'> & { groep: Groep }

export function berekenResultaatPerPost(invoer: ResultaatInvoer): ResultaatPerPost {
  const kostenPerCode = new Map(invoer.codes.map(c => [c.code, c]))

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

  // ── 1. De posten met hun verkoop. `groep` bepaalt waar ze in het scherm komen.
  const concepten: Concept[] = []

  if (invoer.regieCode) {
    concepten.push({
      sleutel: 'regie', groep: 'regie', code: invoer.regieCode, omschrijving: 'Regie',
      soort: 'regie', grondslag: 'doorgerekend', verkoop: doorgerekend(invoer.regieCode, null),
    })
  }

  for (const s of invoer.stelposten) {
    if (!s.in_opdracht) continue
    const code = s.bewakingscode || null
    let verkoop = getal(s.bedrag_excl_btw)
    let grondslag: VerkoopGrondslag = 'vast'
    if (s.grondslag === 'eenheidsprijzen') {
      if (s.hoeveelheid_werkelijk != null && getal(s.hoeveelheid_werkelijk) !== 0) {
        verkoop = getal(s.eenheidsprijs) * getal(s.hoeveelheid_werkelijk)
        grondslag = 'eenheidsprijs'
      }
    } else if (s.grondslag === 'geboekte_kosten') {
      // Het afgesproken stelpostbedrag blijft de verwachting tot de stelpost verrekend is: pas dan
      // ligt het verschil (meer of minder) vast. Niet doorrekenen vanuit de werkbegroting — die is
      // kostprijs, en kostprijs × opslag zegt niets over wat er met de klant is afgesproken.
      // Ligt de al geboekte verkoopwaarde erboven, dan is dat de ondergrens.
      const verrekening = invoer.meerwerk.find(m => m.opdracht_onderdeel_id === s.id && GOEDGEKEURD.has(m.status))
      const geboekteVerkoop = code ? (invoer.verkoopPerCode.get(code) ?? 0) : 0
      if (verrekening) {
        verkoop += getal(verrekening.bedrag_excl_btw)
        grondslag = 'verrekend'
      } else if (geboekteVerkoop > verkoop) {
        verkoop = geboekteVerkoop
        grondslag = 'geboekt'
      }
    }
    concepten.push({
      sleutel: `sp-${s.id}`, groep: s.in_aanneemsom ? 'stelpost' : 'meerwerk', code,
      omschrijving: s.omschrijving, soort: 'stelpost', grondslag, verkoop: rond(verkoop),
    })
  }

  for (const o of invoer.opties ?? []) {
    concepten.push({
      sleutel: `op-${o.id}`, groep: 'optie', code: null, omschrijving: o.omschrijving,
      soort: 'optie', grondslag: 'vast', verkoop: rond(getal(o.bedrag_excl_btw)),
    })
  }

  for (const m of invoer.meerwerk) {
    if (!GOEDGEKEURD.has(m.status)) continue
    // Een verrekening van een stelpost: dat verschil telt al in de stelpostregel zelf.
    if (m.opdracht_onderdeel_id != null) continue

    // Een gekoppelde code (geen eigen code) rekent niet op de geboekte kosten van die code: daar kan
    // ook aanneemsomwerk op staan. Hij telt dus zoals zonder code, alleen onder die code.
    const eigenCode = m.bewakingscode || null
    const kostencode = eigenCode ?? (m.kosten_bewakingscode || null)
    const opGeboekteKosten = m.afrekenwijze === 'regie'
      || (m.is_stelpost === true && m.stelpost_grondslag === 'geboekte_kosten')
    let verkoop: number
    let grondslag: VerkoopGrondslag
    if (m.is_stelpost && m.stelpost_grondslag === 'eenheidsprijzen') {
      verkoop = getal(m.eenheidsprijs) * getal(m.hoeveelheid_werkelijk)
      grondslag = 'eenheidsprijs'
    } else if (opGeboekteKosten) {
      // Zonder eigen code is er niets door te rekenen; het bedrag op de regel is dan de schatting.
      verkoop = eigenCode ? doorgerekend(eigenCode, null) : getal(m.bedrag_excl_btw)
      grondslag = eigenCode ? 'doorgerekend' : 'vast'
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
    concepten.push({
      sleutel: `mw-${m.id}`, groep: 'meerwerk', code: kostencode, omschrijving: m.omschrijving,
      soort: 'meerwerk', grondslag, verkoop: rond(verkoop),
    })
  }

  // ── 2. Kosten per code over de posten verdelen.
  const postenPerCode = new Map<string, Concept[]>()
  for (const c of concepten) {
    if (!c.code) continue
    postenPerCode.set(c.code, [...(postenPerCode.get(c.code) ?? []), c])
  }

  // Een code die in Bouw7 zowel aanneemsom- als meerwerkbudget draagt (bv. HR.A met begroting én
  // meerwerk): staat er alleen meerwerk op, dan hoort alleen het meerwerkdeel bij die posten, naar
  // verhouding van de twee budgetten. Het aanneemsomdeel gaat naar de hoofdaanneemsom.
  const postDeel = (code: string, posten: Concept[]): number => {
    if (!posten.every(p => p.soort === 'meerwerk')) return 1
    const k = kostenPerCode.get(code)
    const begroot = Math.max(0, k?.begroot ?? 0)
    const meerwerk = Math.max(0, k?.meerwerk ?? 0)
    if (begroot <= 0 || meerwerk <= 0) return 1
    return meerwerk / (begroot + meerwerk)
  }

  const aandeelPerPost = new Map<string, number>()
  const restPerCode = new Map<string, number>()
  for (const [code, posten] of postenPerCode) {
    const deel = postDeel(code, posten)
    if (deel < 1) restPerCode.set(code, 1 - deel)
    // Meerdere posten op één code: naar verhouding van hun verkoop, of gelijk als die nul is.
    const somVerkoop = posten.reduce((s, p) => s + Math.abs(p.verkoop), 0)
    for (const p of posten) {
      const gewicht = somVerkoop > 0 ? Math.abs(p.verkoop) / somVerkoop : 1 / posten.length
      aandeelPerPost.set(p.sleutel, deel * gewicht)
    }
  }

  const maakPost = (concept: Concept): ResultaatPost => {
    const { groep, ...c } = concept
    void groep
    if (!c.code) return { ...c, prognose: null, resultaat: null, margePct: null, kostenAandeel: null }
    const aandeel = aandeelPerPost.get(c.sleutel) ?? 1
    const prognose = rond((kostenPerCode.get(c.code)?.prognose ?? 0) * aandeel)
    const resultaat = rond(c.verkoop - prognose)
    return {
      ...c, prognose, resultaat, margePct: margeVan(resultaat, c.verkoop),
      kostenAandeel: aandeel < 0.99995 ? rond(aandeel * 10000) / 10000 : null,
    }
  }

  // ── 3. Hoofdopdracht: alle codes zonder eigen post, plus het aanneemsomdeel van gedeelde codes.
  // De onderdelen zijn diezelfde codes met hun aandeel; de prognose is er de som van. De koppeling
  // sorteert ze alleen (gekoppeld eerst), en een code met prognose 0 die niet gekoppeld is laten we
  // weg — hij draagt niets bij.
  const gekoppeld = invoer.gekoppeld ?? new Set<string>()
  const alleOnderdelen: HoofdOnderdeel[] = invoer.codes.map(c => {
    const deel = postenPerCode.has(c.code) ? (restPerCode.get(c.code) ?? 0) : 1
    return { code: c.code, naam: c.naam, hoofdstuk: c.hoofdstuk ?? null, prognose: c.prognose * deel, gekoppeld: gekoppeld.has(c.code) }
  })
  const hoofdKosten = rond(alleOnderdelen.reduce((s, o) => s + o.prognose, 0))
  const onderdelen = alleOnderdelen
    .filter(o => o.prognose !== 0 || o.gekoppeld)
    .sort((a, b) => Number(b.gekoppeld) - Number(a.gekoppeld)
      || Number(a.hoofdstuk == null) - Number(b.hoofdstuk == null)
      || (a.hoofdstuk ?? '').localeCompare(b.hoofdstuk ?? '', 'nl')
      || a.code.localeCompare(b.code, 'nl'))
  let hoofd: ResultaatPost | null = null
  if (invoer.aanneemsomBasis != null || hoofdKosten !== 0) {
    const verkoop = rond(invoer.aanneemsomBasis ?? 0)
    const resultaat = rond(verkoop - hoofdKosten)
    hoofd = {
      sleutel: 'hoofd', code: null,
      omschrijving: invoer.aanneemsomBasis != null ? 'Hoofdopdracht' : 'Overige codes',
      soort: 'hoofd', grondslag: 'aanneemsom', verkoop, prognose: hoofdKosten, resultaat,
      margePct: margeVan(resultaat, verkoop), kostenAandeel: null, onderdelen,
    }
  }

  const uit = (groep: Groep) => concepten.filter(c => c.groep === groep).map(maakPost)
  const regie = uit('regie')[0] ?? null
  const stelposten = uit('stelpost')
  const opties = uit('optie')
  const meerwerk = uit('meerwerk')
  const aanneemsomPosten = [...(regie ? [regie] : []), ...(hoofd ? [hoofd] : []), ...stelposten, ...opties]

  const alles = [...aanneemsomPosten, ...meerwerk]
  const verkoop = rond(alles.reduce((s, p) => s + p.verkoop, 0))
  const prognose = rond(alles.reduce((s, p) => s + (p.prognose ?? 0), 0))
  const resultaat = rond(verkoop - prognose)

  return {
    aanneemsom: {
      regie, hoofd, stelposten, opties,
      subtotaalStelposten: subtotaalVan(stelposten),
      subtotaal: subtotaalVan(aanneemsomPosten),
    },
    meerwerk: { posten: meerwerk, subtotaal: subtotaalVan(meerwerk) },
    totaal: { verkoop, prognose, resultaat, margePct: margeVan(resultaat, verkoop) },
    prognoseBron: invoer.prognoseBron ?? 'bouw7',
  }
}
