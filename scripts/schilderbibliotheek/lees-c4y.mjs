/**
 * Leest `Bibliotheek - Onderhoud..c4y` en levert de genormaliseerde matrix op.
 *
 * De c4y-structuur zit in het veld <s>: 1 = hoofdgroep (ondergrond), 2 = behandeling,
 * leeg = detailregel. Een detailregel is één cel in de behandeling × onderdeel-matrix:
 *   <arb> = uren per eenheid (tijdnorm), <maa> = materiaalkosten € per eenheid,
 *   <uurloon> = het tarief waarmee Calc4You rekende.
 * Geverifieerd op regel 89: 0,52 u × € 45,00 + € 9,07 = € 32,47 = <totaal>.
 *
 * Alleen de matrixgroepen OH/OK/OM/OS komen hier uit. HR (houtrot) zit al als
 * recept in EVA; BP/BB zijn samengestelde staartkostenposten met een eigen vorm
 * en worden door lees-staartkosten.mjs afgehandeld.
 */

import { readFileSync } from 'node:fs'

const MATRIX_GROEPEN = new Set(['OH', 'OK', 'OM', 'OS'])

/** Nederlands getal: punt = duizendtal, komma = decimaal. "1.400,00" → 1400 */
export function leesGetal(txt) {
  if (!txt) return 0
  const n = parseFloat(String(txt).replace(/\./g, '').replace(',', '.'))
  return Number.isNaN(n) ? 0 : n
}

/** Eenheidsvarianten uit het bestand naar de EVA-eenheden. */
const EENHEID_MAP = {
  'm2': 'm²', 'm²': 'm²',
  'm1': 'm¹', 'm¹': 'm¹',
  'm3': 'm³', 'm³': 'm³',
  'st': 'st', 'stk': 'st', 'stuk': 'st', 'stuks': 'st', 'stuk(s)': 'st', 'st.': 'st',
  'post': 'post', 'week': 'week', 'uur': 'uur', 'set': 'set', 'rit': 'st', 'strek': 'm¹',
}

export function mapEenheid(ruw) {
  const k = String(ruw || '').toLowerCase().trim()
  return EENHEID_MAP[k] ?? ruw.trim()
}

/**
 * Minimale XML-lezer voor het platte c4y-formaat: één niveau <begroting> met
 * uitsluitend tekstuele kindelementen. Geen DOM nodig — het bestand heeft geen
 * attributen, namespaces of geneste elementen binnen een regel.
 */
function leesRegels(xml) {
  const regels = []
  const blokPatroon = /<begroting>([\s\S]*?)<\/begroting>/g
  let blok
  while ((blok = blokPatroon.exec(xml)) !== null) {
    const velden = {}
    const veldPatroon = /<(\w+)(?:\s*\/>|>([\s\S]*?)<\/\1>)/g
    let veld
    while ((veld = veldPatroon.exec(blok[1])) !== null) {
      velden[veld[1]] = (veld[2] ?? '').trim()
    }
    regels.push(velden)
  }
  return regels
}

function ontsnapOngedaan(s) {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

/**
 * @returns {{behandelingen: Map<string, object>, cellen: Array<object>, meldingen: Array<string>}}
 */
export function leesC4y(pad, { codeCorrecties = {}, behandelingCorrecties = {}, suffixSamenvoeging = {} } = {}) {
  const xml = readFileSync(pad, 'utf8')
  const regels = leesRegels(xml)

  const behandelingen = new Map()   // "OHD 03" → { code, omschrijving, ondergrond, volgorde }
  const cellen = []
  const meldingen = []

  let ondergrond = null
  let volgorde = 0

  for (const r of regels) {
    const s = r.s ?? ''
    const code = ontsnapOngedaan(r.code ?? '')
    const oms = ontsnapOngedaan(r.oms ?? '')

    if (s === '1') { ondergrond = code; continue }
    if (!MATRIX_GROEPEN.has(ondergrond)) continue

    if (s === '2') {
      behandelingen.set(code, {
        code,
        omschrijving: oms,
        ondergrond,
        volgorde: ++volgorde,
      })
      continue
    }
    if (s !== '') continue                       // subgroep of footer
    if (!code || !r.code4) continue              // lege afsluitregel

    // ── Bronfout 1: ontbrekend koppelteken in de regelcode ────────────────
    let regelCode = code
    if (codeCorrecties[regelCode]) {
      meldingen.push(`koppelteken hersteld: ${regelCode} → ${codeCorrecties[regelCode]}`)
      regelCode = codeCorrecties[regelCode]
    }

    // ── Bronfout 2: regel staat onder de verkeerde behandeling ────────────
    // De code is leidend; anders belandt een prijs onder de verkeerde behandeling.
    let behandelingCode = ontsnapOngedaan(r.code4)
    if (behandelingCorrecties[regelCode] && behandelingCorrecties[regelCode] !== behandelingCode) {
      meldingen.push(
        `behandeling gecorrigeerd: ${regelCode} stond onder ${behandelingCode}, ` +
        `hoort bij ${behandelingCorrecties[regelCode]}`
      )
      behandelingCode = behandelingCorrecties[regelCode]
    }

    const prefix = behandelingCode.replace(/\s/g, '')
    if (!regelCode.startsWith(prefix + '-')) {
      meldingen.push(`OVERGESLAGEN — code volgt het patroon niet: ${regelCode} (behandeling ${behandelingCode})`)
      continue
    }

    // ── Bronfout 3: dubbele onderdeelcode samenvoegen ─────────────────────
    let suffix = regelCode.slice(prefix.length + 1)
    if (suffixSamenvoeging[suffix]) {
      meldingen.push(`onderdeelcode samengevoegd: ${suffix} → ${suffixSamenvoeging[suffix]} (regel ${regelCode})`)
      suffix = suffixSamenvoeging[suffix]
    }

    // De omschrijving begint met "<behandelingscode> - "; die prefix is de
    // behandeling en hoort niet in de onderdeelnaam.
    const bronNaam = oms.startsWith(r.code4 + ' - ') ? oms.slice(r.code4.length + 3) : oms

    cellen.push({
      regelCode,
      behandelingCode,
      suffix,
      bronNaam,
      eenheid: mapEenheid(r.enh ?? ''),
      eenheidRuw: r.enh ?? '',
      urenPerEenheid: leesGetal(r.arb),
      materiaalPerEenheid: leesGetal(r.maa),
      uurloon: leesGetal(r.uurloon),
    })
  }

  return { behandelingen, cellen, meldingen }
}
