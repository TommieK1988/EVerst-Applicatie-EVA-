/**
 * Controleert de mappingtabel tegen het bronbestand vóórdat er een migratie
 * wordt gegenereerd. Faalt hard bij een gat in de mapping — een ontbrekende
 * code zou anders stilzwijgend regels laten verdwijnen.
 *
 *   node scripts/schilderbibliotheek/controleer-mapping.mjs <pad-naar.c4y>
 */

import { leesC4y } from './lees-c4y.mjs'
import {
  CODE_MAPPING, ONDERDELEN, CODE_CORRECTIES,
  BEHANDELING_CORRECTIES, SUFFIX_SAMENVOEGING,
} from './mapping-onderdelen.mjs'

const pad = process.argv[2]
if (!pad) {
  console.error('Gebruik: node controleer-mapping.mjs <pad-naar.c4y>')
  process.exit(1)
}

const { behandelingen, cellen, meldingen } = leesC4y(pad, {
  codeCorrecties: CODE_CORRECTIES,
  behandelingCorrecties: BEHANDELING_CORRECTIES,
  suffixSamenvoeging: SUFFIX_SAMENVOEGING,
})

console.log(`behandelingen : ${behandelingen.size}`)
console.log(`matrixcellen  : ${cellen.length}`)

let fouten = 0

// ── 1. Elke code in het bestand moet gemapt zijn ────────────────────────────
const gebruikt = new Set(cellen.map(c => c.suffix))
const ontbreekt = [...gebruikt].filter(s => !CODE_MAPPING[s]).sort()
if (ontbreekt.length) {
  fouten++
  console.log(`\nFOUT — ${ontbreekt.length} code(s) in het bestand zonder mapping:`)
  for (const s of ontbreekt) {
    const vb = cellen.filter(c => c.suffix === s)
    console.log(`   ${s.padEnd(14)} ${vb.length}x  eenheid=${vb[0].eenheid}  "${vb[0].bronNaam}"`)
  }
}

// ── 2. Geen mapping-regels die nergens voorkomen ────────────────────────────
const ongebruikt = Object.keys(CODE_MAPPING).filter(s => !gebruikt.has(s)).sort()
if (ongebruikt.length) {
  fouten++
  console.log(`\nFOUT — ${ongebruikt.length} mapping-regel(s) zonder bronregels: ${ongebruikt.join(', ')}`)
}

// ── 3. Onderdeelsleutels moeten bestaan ─────────────────────────────────────
const onbekend = [...new Set(Object.values(CODE_MAPPING).map(m => m.onderdeel))]
  .filter(k => !ONDERDELEN[k])
if (onbekend.length) {
  fouten++
  console.log(`\nFOUT — onbekende onderdeelsleutel(s): ${onbekend.join(', ')}`)
}

// ── 4. Eenheid in de mapping moet met het bestand overeenkomen ──────────────
const eenheidConflict = []
for (const c of cellen) {
  const m = CODE_MAPPING[c.suffix]
  if (m && m.eenheid !== c.eenheid) {
    eenheidConflict.push(`${c.regelCode}: mapping=${m.eenheid} bestand=${c.eenheid} (ruw "${c.eenheidRuw}")`)
  }
}
if (eenheidConflict.length) {
  fouten++
  console.log(`\nFOUT — ${eenheidConflict.length} eenheidsconflict(en):`)
  for (const r of eenheidConflict.slice(0, 20)) console.log('   ' + r)
}

// ── 5. (onderdeel, type) moet uniek zijn — anders botst de unieke sleutel ───
const perOnderdeelType = new Map()
for (const [suffix, m] of Object.entries(CODE_MAPPING)) {
  const sleutel = `${m.onderdeel}|${m.type}`
  if (!perOnderdeelType.has(sleutel)) perOnderdeelType.set(sleutel, [])
  perOnderdeelType.get(sleutel).push(suffix)
}
const botsingen = [...perOnderdeelType.entries()].filter(([, v]) => v.length > 1)
if (botsingen.length) {
  fouten++
  console.log(`\nFOUT — ${botsingen.length} (onderdeel, type)-botsing(en):`)
  for (const [k, v] of botsingen) console.log(`   ${k} ← ${v.join(', ')}`)
}

// ── 6. Eén cel per (behandeling, onderdeelcode) ─────────────────────────────
const cel = new Map()
for (const c of cellen) {
  const sleutel = `${c.behandelingCode}|${c.suffix}`
  if (!cel.has(sleutel)) cel.set(sleutel, [])
  cel.get(sleutel).push(c)
}
const dubbel = [...cel.entries()].filter(([, v]) => v.length > 1)
if (dubbel.length) {
  fouten++
  console.log(`\nFOUT — ${dubbel.length} dubbele cel(len):`)
  for (const [k, v] of dubbel.slice(0, 20)) {
    console.log(`   ${k} → ${v.map(x => `${x.urenPerEenheid}u/€${x.materiaalPerEenheid}`).join('  |  ')}`)
  }
}

// ── Signaleringen (geen fout, wel het vermelden waard) ──────────────────────
console.log(`\n── Correcties toegepast (${meldingen.length}) ──`)
for (const m of meldingen) console.log('   ' + m)

const uurlonen = [...new Set(cellen.map(c => c.uurloon))]
console.log(`\nuurlonen in het bestand: ${uurlonen.join(', ')}`)

const onderdeelTelling = new Map()
for (const m of Object.values(CODE_MAPPING)) {
  onderdeelTelling.set(m.onderdeel, (onderdeelTelling.get(m.onderdeel) ?? 0) + 1)
}
console.log(`\nonderdelen: ${onderdeelTelling.size}, types: ${Object.keys(CODE_MAPPING).length}`)

// Paren die hetzelfde fysieke ding beschrijven onder één onderdeel: geen fout,
// maar wel de moeite om later één van de twee te laten vervallen.
const gelijkeNamen = new Map()
for (const c of cellen) {
  const m = CODE_MAPPING[c.suffix]
  if (!m) continue
  const sleutel = `${m.onderdeel}|${c.bronNaam.toLowerCase().trim()}`
  if (!gelijkeNamen.has(sleutel)) gelijkeNamen.set(sleutel, new Set())
  gelijkeNamen.get(sleutel).add(c.suffix)
}
const overlap = [...gelijkeNamen.entries()].filter(([, v]) => v.size > 1)
if (overlap.length) {
  console.log(`\n── Let op: ${overlap.length} codepaar(en) met dezelfde bronomschrijving ──`)
  for (const [k, v] of overlap) console.log(`   ${k} ← ${[...v].join(', ')}`)
}

console.log(fouten === 0 ? '\nOK — mapping is sluitend.' : `\n${fouten} controle(s) gefaald.`)
process.exit(fouten === 0 ? 0 : 1)
