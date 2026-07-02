/**
 * Calc4You (.c4y) Parser
 *
 * Converteert een native Calc4You werkbegroting-bestand (.c4y) naar de interne
 * Everts Calc datastructuren: Groep[], Calculatieregel[], Componentregel[].
 *
 * Platte XML met lowercase tags; de boom zit in het <s>-veld:
 *   <s> = 1,2,3,…  → GROEP op dat niveau (alleen structuur, nooit als regel importeren)
 *   <s> leeg / S / V → DETAILREGEL (altijd importeren; S = stelpost, V = verrekenbaar)
 *   overig (/, =, a, b, onbekend) of <enh>=%  → FOOTER/subtotaal/BTW-regel → overslaan
 *
 * Uitgangspunten:
 *  - De boom heeft een variabel aantal niveaus. We bouwen 'm op een stapel en cappen
 *    op EVA-max 3 groepsniveaus; diepere groepen worden samengevoegd (groepsnaam voor
 *    de regel-omschrijving), zodat nooit regels verloren gaan.
 *  - Hoeveelheid = <althv> (effectieve hoeveelheid die in de rollup telt), fallback <hvh>.
 *    Zo tellen subregels exact op tot hun post en klopt het totaal op de cent.
 *  - Bedragen: <aard> = kostprijs, <totaal> = verkoop. Opslag% = totaal/aard − 1 (exact).
 *  - Kostenpotjes per eenheid → componenten:
 *      <arb> uren → arbeid (tarief <uurloon>, val. alginfo <ul>)
 *      <maa>/<mee> → materieel-component (EVA toont dit als "Materiaal")
 *      <ond> → onderaanneming
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

/** Nederlands getal: punt = duizendtal, komma = decimaal. "25.098,12" → 25098.12 */
function leesGetal(parent: Element, tag: string): number {
  const txt = leestekst(parent, tag)
  if (!txt) return 0
  const n = parseFloat(txt.replace(/\./g, '').replace(',', '.'))
  return isNaN(n) ? 0 : n
}

/** BTW uit <btw>: 'h'/'hoog'/'1'/'21' = 21%, 'l'/'laag'/'2'/'9' = 9%. Leeg → 21%. */
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

/** Opslag% uit verkoop/kostprijs. EXACT (niet afgerond) zodat totalen op de cent kloppen. */
function leidOpslagAf(kostprijs: number, verkoop: number): number | undefined {
  if (kostprijs <= 0 || verkoop <= 0) return undefined
  const pct = (verkoop / kostprijs - 1) * 100
  return Math.abs(pct) > 0.0001 ? pct : undefined
}

// ─── Rij-classificatie op <s> ─────────────────────────────────────────────────

type RijSoort =
  | { type: 'groep'; niveau: number }
  | { type: 'regel' }
  | { type: 'skip' }

function classificeer(s: string, enh: string): RijSoort {
  if (enh.trim() === '%') return { type: 'skip' }          // BTW-/percentage-footer (s=a/s=b)
  const t = s.trim()
  if (/^\d+$/.test(t)) {
    const n = parseInt(t, 10)
    return n > 0 ? { type: 'groep', niveau: n } : { type: 'skip' }
  }
  const u = t.toUpperCase()
  if (t === '' || u === 'S' || u === 'V') return { type: 'regel' }
  return { type: 'skip' }                                   // '/', '=', 'a', 'b', onbekende codes
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
  /** Gezaghebbend totaal excl. BTW uit <alginfo><totaal>. */
  verwachtTotaal:     number
  /** Som van de geïmporteerde verkoopbedragen (voor reconciliatie). */
  verkoopTotaal:      number
}

// ─── Interne ruwe rij ──────────────────────────────────────────────────────────

interface RuweRij {
  isGroep:        boolean
  niveau:         number   // groepsniveau uit <s> (0 voor een regel)
  oms:            string
  code4:          string
  btw:            { pct: number; herkend: boolean; code: string }
  hvh:            number
  althv:          number
  eenheidRaw:     string
  uurloon:        number
  arb:            number
  maa:            number
  mee:            number
  ond:            number
  aard:           number   // kostprijs van de rij (nominaal, op <hvh>)
  totaal:         number   // verkoop van de rij (nominaal, op <hvh>)
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
  const projectNummer   = alginfo ? leestekst(alginfo, 'kop') : ''
  const projectNaam      = alginfo ? leestekst(alginfo, 'r1')  : ''
  const opdrachtgever    = alginfo ? leestekst(alginfo, 'og')  : ''
  const standaardUurloon = alginfo ? leesGetal(alginfo, 'ul')  : 0
  const verwachtTotaal   = alginfo ? leesGetal(alginfo, 'totaal') : 0

  // ─── Pass 1: ruwe rijen → boom op een stapel (variabele diepte) ─────────────
  const roots: RuweRij[] = []
  const stack: RuweRij[] = []   // open groepen, oplopend in niveau

  for (const el of Array.from(root.children).filter(c => c.tagName === 'begroting')) {
    const s   = leestekst(el, 's')
    const enh = leestekst(el, 'enh')
    const oms = leestekst(el, 'oms')
    const soort = classificeer(s, enh)
    if (soort.type === 'skip') continue

    const totaal = leesGetal(el, 'totaal')
    if (soort.type === 'regel' && !oms && totaal === 0) continue   // lege/afsluitende regel

    const u = s.trim().toUpperCase()
    const rij: RuweRij = {
      isGroep:        soort.type === 'groep',
      niveau:         soort.type === 'groep' ? soort.niveau : 0,
      oms,
      code4:          leestekst(el, 'code4'),
      btw:            leesBtwCode(el),
      hvh:            leesGetal(el, 'hvh'),
      althv:          leesGetal(el, 'althv'),
      eenheidRaw:     enh,
      uurloon:        leesGetal(el, 'uurloon') || standaardUurloon,
      arb:            leesGetal(el, 'arb'),
      maa:            leesGetal(el, 'maa'),
      mee:            leesGetal(el, 'mee'),
      ond:            leesGetal(el, 'ond'),
      aard:           leesGetal(el, 'aard'),
      totaal,
      isStelpost:     u === 'S' || enh.toLowerCase() === 'stp',
      isVerrekenbaar: u === 'V' || oms.toLowerCase().includes('verrekenbaar'),
      kinderen:       [],
    }

    if (rij.isGroep) {
      while (stack.length && stack[stack.length - 1].niveau >= rij.niveau) stack.pop()
      const parent = stack[stack.length - 1]
      ;(parent ? parent.kinderen : roots).push(rij)
      stack.push(rij)
    } else {
      const parent = stack[stack.length - 1]
      ;(parent ? parent.kinderen : roots).push(rij)
    }
  }

  // ─── Pass 2: boom → EVA-structuren ─────────────────────────────────────────
  const groepen:          Groep[]           = []
  const calculatieregels: Calculatieregel[] = []
  const componentregels:  Componentregel[]  = []
  const onbekendeBtwCodes = new Set<string>()
  let   verkoopTotaal     = 0

  function nieuweGroep(naam: string, niveau: 1 | 2 | 3, parentId: string | null): Groep {
    const volgorde = groepen.filter(g => g.parent_id === parentId).length + 1
    const g: Groep = { id: nieuweId(), scenario_id: scenarioId, parent_id: parentId, naam, niveau, volgorde }
    groepen.push(g)
    return g
  }

  let defaultGroep: Groep | null = null
  const ensureDefaultGroep = () => (defaultGroep ??= nieuweGroep('Algemeen', 1, null))

  function heeftRegelNakomeling(node: RuweRij): boolean {
    return node.kinderen.some(k => !k.isGroep || heeftRegelNakomeling(k))
  }

  /** Aantal echte groepsniveaus in de subboom (childless groepen tellen niet — die worden regels). */
  function groepDiepte(node: RuweRij): number {
    if (!node.isGroep || !heeftRegelNakomeling(node)) return 0
    let max = 0
    for (const k of node.kinderen) if (k.isGroep && heeftRegelNakomeling(k)) max = Math.max(max, groepDiepte(k))
    return 1 + max
  }

  /**
   * Voeg één calculatieregel + componenten toe.
   * @param bedragenTotaal true → arb/maa/mee/ond zijn totalen (childless groep); anders per eenheid.
   */
  function voegRegelToe(node: RuweRij, groep: Groep, hoofdstukNaam: string, bedragenTotaal: boolean, naamPrefix: string) {
    const hvhNom      = node.hvh || 1
    const hoeveelheid = node.althv || node.hvh || 1
    const deler       = bedragenTotaal ? hoeveelheid : 1   // totalen → per eenheid delen
    const arbU = node.arb / deler
    const maaU = node.maa / deler
    const meeU = node.mee / deler
    const ondU = node.ond / deler

    const perEenheidKp = arbU * node.uurloon + maaU + meeU + ondU
    // Opslag uit de rij-eigen verhouding kostprijs↔verkoop (hoeveelheids-onafhankelijk).
    const nominaleKp = node.aard > 0 ? node.aard : perEenheidKp * hvhNom
    const opslag = leidOpslagAf(nominaleKp, node.totaal)

    const btw = node.btw
    if (!btw.herkend) onbekendeBtwCodes.add(btw.code)

    const omschrijving = (naamPrefix ? `${naamPrefix} — ` : '') + (node.oms || 'Regel')
    const volgorde = calculatieregels.filter(r => r.groep_id === groep.id).length + 1
    const regel: Calculatieregel = {
      id:           nieuweId(),
      groep_id:     groep.id,
      omschrijving,
      hoeveelheid,
      eenheid:      mapEenheid(node.eenheidRaw),
      volgorde,
      btw_pct:      btw.pct,
      ...(opslag !== undefined ? { opslag_pct: opslag } : {}),
      ...(node.isStelpost ? { is_stelpost: true } : {}),
      ...(node.isVerrekenbaar ? { is_verrekenbaar: true } : {}),
      ...(hoofdstukNaam ? { kostengroep: hoofdstukNaam } : {}),
      ...(node.code4 ? { opmerking: node.code4 } : {}),
    }
    calculatieregels.push(regel)

    if (arbU > 0) componentregels.push({
      id: nieuweId(), calculatieregel_id: regel.id,
      type: 'arbeid', norm_hoeveelheid: arbU, tarief: node.uurloon, eenheid: 'uur',
    })
    if (maaU > 0) componentregels.push({
      id: nieuweId(), calculatieregel_id: regel.id,
      type: 'materieel', norm_hoeveelheid: 1, tarief: maaU, omschrijving: 'Materiaal',
    })
    if (meeU > 0) componentregels.push({
      id: nieuweId(), calculatieregel_id: regel.id,
      type: 'materieel', norm_hoeveelheid: 1, tarief: meeU, omschrijving: 'Materiaal',
    })
    if (ondU > 0) componentregels.push({
      id: nieuweId(), calculatieregel_id: regel.id,
      type: 'onderaanneming', norm_hoeveelheid: 1, tarief: ondU,
    })

    const evaKostprijs = perEenheidKp * hoeveelheid
    verkoopTotaal += evaKostprijs * (1 + (opslag ?? 0) / 100)
  }

  /**
   * Loop de ruwe boom af. EVA staat max 3 groepsniveaus toe; is de boom dieper, dan
   * worden de bovenste (zuivere) groepen samengevoegd: hun omschrijving wordt gecombineerd
   * ("Hoofdstuk — Post") tot één groep, zodat alle regels binnen 3 niveaus vallen en er
   * niets verloren gaat. Totalen zijn onafhankelijk van de groepering.
   */
  function verwerk(node: RuweRij, parentGroep: Groep | null, evaNiveau: number, groepPrefix: string, hoofdstukNaam: string) {
    // Losse regel, of een groep zonder regels eronder (→ als één regel importeren).
    if (!node.isGroep || !heeftRegelNakomeling(node)) {
      const groep = parentGroep ?? ensureDefaultGroep()
      voegRegelToe(node, groep, hoofdstukNaam || groep.naam, node.isGroep, groepPrefix)
      return
    }
    const naam = groepPrefix ? `${groepPrefix} — ${node.oms}` : (node.oms || `Groep ${evaNiveau}`)
    const heeftRegelKind = node.kinderen.some(k => !(k.isGroep && heeftRegelNakomeling(k)))
    const teDiep = (evaNiveau - 1) + groepDiepte(node) > 3

    // Te diep én puur structuur (alleen subgroepen) → geen eigen EVA-groep; naam meenemen
    // naar beneden zodat 'ie samensmelt met het volgende niveau.
    if (teDiep && !heeftRegelKind) {
      const hk = evaNiveau === 1 ? naam : hoofdstukNaam
      for (const kind of node.kinderen) verwerk(kind, parentGroep, evaNiveau, naam, hk)
      return
    }

    const niveau = Math.min(evaNiveau, 3) as 1 | 2 | 3
    const g = nieuweGroep(naam, niveau, parentGroep?.id ?? null)
    const hk = evaNiveau === 1 ? naam : hoofdstukNaam
    for (const kind of node.kinderen) verwerk(kind, g, evaNiveau + 1, '', hk)
  }

  for (const r of roots) verwerk(r, null, 1, '', '')

  return {
    projectNaam,
    projectNummer,
    opdrachtgever,
    uurloon: standaardUurloon,
    groepen,
    calculatieregels,
    componentregels,
    onbekendeBtwCodes: Array.from(onbekendeBtwCodes),
    verwachtTotaal,
    verkoopTotaal: Math.round(verkoopTotaal * 100) / 100,
  }
}
