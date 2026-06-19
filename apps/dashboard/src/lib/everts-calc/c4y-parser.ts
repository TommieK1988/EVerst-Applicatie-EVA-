/**
 * Calc4You (.c4y) Parser
 *
 * Converteert een native Calc4You werkbegroting-bestand (.c4y) naar de interne
 * Everts Calc datastructuren: Groep[], Calculatieregel[], Componentregel[].
 *
 * Anders dan het CUF-uitwisselformaat (zie cuf-parser.ts) is .c4y een eigen,
 * platte XML met lowercase tags en tekstinhoud in kind-elementen:
 *
 *   <alginfo> … </alginfo>          → projectkop + totalen
 *   <begroting> … </begroting> × N  → regels; de boom zit in het <s>-veld
 *
 * Boomstructuur — leidend is <s> (NIET <ouder>, dat is niet altijd gevuld):
 *   <s>=1  → hoofdstuk         (Groep niveau 1)
 *   <s>=2  → post              (Groep niveau 2 óf — als de subregels niet optellen
 *                               tot de post — een samengevatte regel)
 *   <s> leeg → detailregel     (Calculatieregel, prijzen per eenheid)
 *   <s>=S  of <enh>=stp → detailregel + is_stelpost
 *   <s>=V  → detailregel + is_verrekenbaar
 *   <s>=/  of <s>== → subtotaal / eindtotaal → overslaan
 *
 * Bedragen: <aard> = kostprijs van de regel, <totaal> = verkoopprijs (incl. opslag).
 * De OPSLAG% wordt per regel afgeleid uit verkoop/kostprijs (totaal/aard); staat er
 * geen opslag in (kostprijsbegroting), dan is verkoop = kostprijs en blijft opslag leeg.
 *
 * Per DETAILregel zijn de kostenpotjes prijzen PER EENHEID; op POST/HOOFDSTUK-regels
 * zijn het TOTALEN (worden door de hoeveelheid gedeeld om de eenheidsprijs te krijgen).
 *   <arb> = uren        → arbeid    (tarief = <uurloon>, val. alginfo <ul>)
 *   <maa> = materiaal   → materieel-component (in EVA getoond als "Materiaal")
 *   <mee> = materieel   → materieel-component (ook als "Materiaal" — geen apart type)
 *   <ond> = onderaann.  → onderaanneming
 *
 * Gebruikt DOMParser — alleen client-side uitvoeren (browser).
 */

import type { Groep, Calculatieregel, Componentregel, Eenheid } from './types'
import { EENHEDEN } from './types'
import { nieuweId } from './utils'

// ─── Helpers ────────────────────────────────────────────────────────────────

function leestekst(parent: Element, tag: string): string {
  const el = Array.from(parent.children).find(c => c.tagName === tag)
  return el?.textContent?.trim() ?? ''
}

/**
 * Parse een Calc4You-getal (Nederlands formaat): punt = duizendtal, komma = decimaal.
 * "25.098,12" → 25098.12 · "0,46" → 0.46 · "1108" → 1108 · "442,4" → 442.4
 */
function leesGetal(parent: Element, tag: string): number {
  const txt = leestekst(parent, tag)
  if (!txt) return 0
  const n = parseFloat(txt.replace(/\./g, '').replace(',', '.'))
  return isNaN(n) ? 0 : n
}

/**
 * BTW uit <btw>. Calc4You-conventie: 'h'/'hoog' = 21%, 'l'/'laag' = 9%.
 * Daarnaast een paar varianten en een kaal percentage. Leeg → hoog (21%).
 * Onbekende, niet-lege code → 21% maar herkend=false (zodat de import 'm meldt).
 */
const BTW_HOOG = ['a', 'h', 'hoog', '1', '21']
const BTW_LAAG = ['b', 'l', 'laag', '2', '9']

function leesBtwCode(parent: Element): { pct: number; herkend: boolean; code: string } {
  const code = leestekst(parent, 'btw')
  const t = code.toLowerCase()
  if (!t)                   return { pct: 21, herkend: true, code }
  if (BTW_HOOG.includes(t)) return { pct: 21, herkend: true, code }
  if (BTW_LAAG.includes(t)) return { pct: 9,  herkend: true, code }
  const n = parseFloat(t.replace(',', '.'))
  if (!isNaN(n))            return { pct: n, herkend: true, code }
  return { pct: 21, herkend: false, code }
}

/** Map Calc4You-eenheden naar Everts Calc eenheden. */
function mapEenheid(raw: string): Eenheid {
  const mapping: Record<string, Eenheid> = {
    'm2': 'm²', 'm²': 'm²',
    'm1': 'm¹', 'm¹': 'm¹',
    'm3': 'm³', 'm³': 'm³',
    'st': 'st', 'stk': 'st', 'sts': 'st', 'stuk': 'st', 'stuks': 'st',
    'uur': 'uur', 'uren': 'uur',
    'dag': 'dag', 'dagen': 'dag',
    'ltr': 'ltr', 'l': 'ltr',
    'kg': 'kg',
    'set': 'set',
    'stp': 'Stelpost',
    '': 'st',
  }
  const gen = raw.toLowerCase().trim()
  if (mapping[gen] !== undefined) return mapping[gen]
  if ((EENHEDEN as readonly string[]).includes(raw)) return raw as Eenheid
  return 'st'   // 'rit', 'week', 'm2/4wk' e.d. → geen 1-op-1 eenheid; bedrag blijft correct
}

/**
 * Leid opslag% af uit verkoop/kostprijs. EXACT (niet afgerond) zodat EVA per regel
 * precies het verkoopbedrag uit het bestand reproduceert en alle totalen op de cent
 * kloppen. De UI rondt het percentage in de weergave af. Geen opslag → undefined.
 */
function leidOpslagAf(kostprijs: number, verkoop: number): number | undefined {
  if (kostprijs <= 0 || verkoop <= 0) return undefined
  const pct = (verkoop / kostprijs - 1) * 100
  return Math.abs(pct) > 0.0001 ? pct : undefined
}

/** abs-verschil binnen 0,5% of 50 cent. */
function ongeveerGelijk(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(0.5, Math.abs(b) * 0.005)
}

// ─── Exporttype ───────────────────────────────────────────────────────────────

export interface C4yParseResultaat {
  projectNaam:        string
  projectNummer:      string
  opdrachtgever:      string
  uurloon:            number
  groepen:            Groep[]
  calculatieregels:   Calculatieregel[]
  componentregels:    Componentregel[]
  /** Niet-herkende <btw>-codes (op 21% gezet) — om bij import te kunnen signaleren. */
  onbekendeBtwCodes:  string[]
  /** Posten waarvan de subregels niet optelden en die als één regel zijn samengevat. */
  samengevattePosten: string[]
}

// ─── Interne ruwe rij ──────────────────────────────────────────────────────────

interface RuweRij {
  kind:           'hoofdstuk' | 'post' | 'detail'
  oms:            string
  code4:          string
  btw:            { pct: number; herkend: boolean; code: string }
  hvh:            number
  eenheidRaw:     string
  uurloon:        number
  arb:            number
  maa:            number
  mee:            number
  ond:            number
  totaal:         number   // verkoopprijs
  isStelpost:     boolean
  isVerrekenbaar: boolean
  kinderen:       RuweRij[]
}

// ─── Hoofd parser ─────────────────────────────────────────────────────────────

export function parseC4y(xmlString: string, scenarioId: string): C4yParseResultaat {
  const schoon = xmlString.replace(/^﻿/, '').trim()

  const doc = new DOMParser().parseFromString(schoon, 'application/xml')
  const foutEl = doc.querySelector('parsererror')
  if (foutEl) {
    throw new Error('Ongeldig .c4y-bestand: ' + (foutEl.textContent?.slice(0, 200) ?? 'parsefout'))
  }

  const root = doc.documentElement
  if (root.tagName !== 'calc4you') {
    throw new Error(`Dit lijkt geen .c4y-bestand te zijn (root-element <${root.tagName}>).`)
  }

  // ─── Projectkop ───────────────────────────────────────────────────────────
  const alginfo = Array.from(root.children).find(c => c.tagName === 'alginfo') ?? null
  const projectNummer = alginfo ? leestekst(alginfo, 'kop') : ''
  const projectNaam   = alginfo ? leestekst(alginfo, 'r1')  : ''
  const opdrachtgever = alginfo ? leestekst(alginfo, 'og')  : ''
  const standaardUurloon = alginfo ? leesGetal(alginfo, 'ul') : 0

  // ─── Pass 1: ruwe rijen + boom (op <s>) ────────────────────────────────────
  const hoofdstukken: RuweRij[] = []
  let curHoofdstuk: RuweRij | null = null
  let curPost: RuweRij | null = null

  function maakSyntheticHoofdstuk(): RuweRij {
    const h = leegRij('hoofdstuk', 'Algemeen')
    hoofdstukken.push(h)
    curHoofdstuk = h
    curPost = null
    return h
  }

  for (const el of Array.from(root.children).filter(c => c.tagName === 'begroting')) {
    const s   = leestekst(el, 's')
    const oms = leestekst(el, 'oms')
    if (s === '/' || s === '=') continue

    const totaal = leesGetal(el, 'totaal')
    let kind: RuweRij['kind']
    if (s === '1')      kind = 'hoofdstuk'
    else if (s === '2') kind = 'post'
    else {
      if (!oms && totaal === 0) continue   // lege/afsluitende regel
      kind = 'detail'
    }

    const eenheidRaw = leestekst(el, 'enh')
    const rij: RuweRij = {
      kind,
      oms,
      code4:          leestekst(el, 'code4'),
      btw:            leesBtwCode(el),
      hvh:            leesGetal(el, 'hvh'),
      eenheidRaw,
      uurloon:        leesGetal(el, 'uurloon') || standaardUurloon,
      arb:            leesGetal(el, 'arb'),
      maa:            leesGetal(el, 'maa'),
      mee:            leesGetal(el, 'mee'),
      ond:            leesGetal(el, 'ond'),
      totaal,
      isStelpost:     s === 'S' || eenheidRaw.toLowerCase() === 'stp',
      isVerrekenbaar: s === 'V' || oms.toLowerCase().includes('verrekenbaar'),
      kinderen:       [],
    }

    if (kind === 'hoofdstuk') {
      hoofdstukken.push(rij); curHoofdstuk = rij; curPost = null
    } else if (kind === 'post') {
      if (!curHoofdstuk) maakSyntheticHoofdstuk()
      curHoofdstuk!.kinderen.push(rij); curPost = rij
    } else {
      const parent = curPost ?? curHoofdstuk ?? maakSyntheticHoofdstuk()
      parent.kinderen.push(rij)
    }
  }

  // ─── Pass 2: bouw EVA-structuren ───────────────────────────────────────────
  const groepen:          Groep[]           = []
  const calculatieregels: Calculatieregel[] = []
  const componentregels:  Componentregel[]  = []
  const onbekendeBtwCodes  = new Set<string>()
  const samengevattePosten: string[]        = []

  function nieuweGroep(naam: string, niveau: 1 | 2, parentId: string | null, volgorde: number): Groep {
    const g: Groep = { id: nieuweId(), scenario_id: scenarioId, parent_id: parentId, naam, niveau, volgorde }
    groepen.push(g)
    return g
  }

  /** Voeg een calculatieregel + componenten toe. perEenheid=false → bedragen zijn totalen (post). */
  function voegRegelToe(rij: RuweRij, groep: Groep, hoofdstukNaam: string, perEenheid: boolean, btwOverride?: RuweRij['btw']) {
    const hvh = rij.hvh || 1
    // Eenheidsprijzen: detail = al per eenheid; post = totalen / hoeveelheid
    const deler = perEenheid ? 1 : hvh
    const arbEh = rij.arb / deler
    const maaEh = rij.maa / deler
    const meeEh = rij.mee / deler
    const ondEh = rij.ond / deler

    const kostprijsTot = (arbEh * rij.uurloon + maaEh + meeEh + ondEh) * hvh
    const opslag = leidOpslagAf(kostprijsTot, rij.totaal)

    const btw = btwOverride ?? rij.btw
    if (!btw.herkend) onbekendeBtwCodes.add(btw.code)

    const volgorde = calculatieregels.filter(r => r.groep_id === groep.id).length + 1
    const regel: Calculatieregel = {
      id:           nieuweId(),
      groep_id:     groep.id,
      omschrijving: rij.oms || `Regel ${volgorde}`,
      hoeveelheid:  hvh,
      eenheid:      mapEenheid(rij.eenheidRaw),
      volgorde,
      btw_pct:      btw.pct,
      ...(opslag !== undefined ? { opslag_pct: opslag } : {}),
      ...(rij.isStelpost ? { is_stelpost: true } : {}),
      ...(rij.isVerrekenbaar ? { is_verrekenbaar: true } : {}),
      ...(hoofdstukNaam ? { kostengroep: hoofdstukNaam } : {}),
      ...(rij.code4 ? { opmerking: rij.code4 } : {}),
    }
    calculatieregels.push(regel)

    if (arbEh > 0) componentregels.push({
      id: nieuweId(), calculatieregel_id: regel.id,
      type: 'arbeid', norm_hoeveelheid: arbEh, tarief: rij.uurloon, eenheid: 'uur',
    })
    if (maaEh > 0) componentregels.push({
      id: nieuweId(), calculatieregel_id: regel.id,
      type: 'materieel', norm_hoeveelheid: 1, tarief: maaEh, omschrijving: 'Materiaal',
    })
    if (meeEh > 0) componentregels.push({
      id: nieuweId(), calculatieregel_id: regel.id,
      type: 'materieel', norm_hoeveelheid: 1, tarief: meeEh, omschrijving: 'Materiaal',
    })
    if (ondEh > 0) componentregels.push({
      id: nieuweId(), calculatieregel_id: regel.id,
      type: 'onderaanneming', norm_hoeveelheid: 1, tarief: ondEh,
    })
  }

  let g1Volgorde = 0
  for (const hoofdstuk of hoofdstukken) {
    g1Volgorde += 1
    const g1 = nieuweGroep(hoofdstuk.oms || `Hoofdstuk ${g1Volgorde}`, 1, null, g1Volgorde)
    let g2Volgorde = 0

    for (const kind of hoofdstuk.kinderen) {
      if (kind.kind === 'detail') {
        // Detailregel rechtstreeks onder het hoofdstuk (bijv. stelposten)
        voegRegelToe(kind, g1, hoofdstuk.oms, true)
        continue
      }
      // Post (s=2): groep als de subregels optellen tot de post, anders één regel
      const subregels = kind.kinderen.filter(k => k.kind === 'detail')
      const subSom = subregels.reduce((s, k) => s + k.totaal, 0)
      if (subregels.length > 0 && ongeveerGelijk(subSom, kind.totaal)) {
        g2Volgorde += 1
        const g2 = nieuweGroep(kind.oms || `Post ${g2Volgorde}`, 2, g1.id, g2Volgorde)
        for (const sub of subregels) voegRegelToe(sub, g2, hoofdstuk.oms, true)
      } else {
        // Post zelf als (samengevatte) regel; bedragen zijn totalen.
        // BTW van de post (vaak leeg) → erf van de eerste subregel.
        const btwOverride = kind.btw.code === '' && subregels[0] ? subregels[0].btw : undefined
        voegRegelToe(kind, g1, hoofdstuk.oms, false, btwOverride)
        if (subregels.length > 0) samengevattePosten.push(kind.oms)
      }
    }
  }

  return {
    projectNaam,
    projectNummer,
    opdrachtgever,
    uurloon: standaardUurloon,
    groepen,
    calculatieregels,
    componentregels,
    onbekendeBtwCodes: Array.from(onbekendeBtwCodes),
    samengevattePosten,
  }
}

// ─── Hulp ──────────────────────────────────────────────────────────────────────

function leegRij(kind: RuweRij['kind'], oms: string): RuweRij {
  return {
    kind, oms, code4: '', btw: { pct: 21, herkend: true, code: '' },
    hvh: 1, eenheidRaw: '', uurloon: 0, arb: 0, maa: 0, mee: 0, ond: 0,
    totaal: 0, isStelpost: false, isVerrekenbaar: false, kinderen: [],
  }
}
