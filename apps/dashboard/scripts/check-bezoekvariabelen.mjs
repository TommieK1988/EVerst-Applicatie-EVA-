/**
 * Controleert dat élke sleutel van het bezoekrapport-contract ook in de variabelencatalogus
 * staat, en dat het gegenereerde sjabloon geen tag gebruikt die de catalogus niet kent.
 *
 * Waarom dit script bestaat: `variabelen.ts` is handmatig gesynchroniseerd met de
 * contextbouwers — dat staat zo in de kopcommentaren en is een bewuste keuze. Het gevolg is
 * dat een nieuw veld in de context stilzwijgend ontbreekt in de catalogus, waarna
 * "Template controleren" een werkende tag als onbekend markeert. Precies dat was gebeurd met
 * het hele kwaliteitsrapport: nul van zijn tags stond erin.
 *
 * Draaien:  node apps/dashboard/scripts/check-bezoekvariabelen.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const PizZip = require('pizzip')

const hier = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(hier, '../../..')
const src = path.join(repo, 'apps/dashboard/src/lib/documenten')

/** Transpileert een TS-bestand naar CJS en laadt het, met de opgegeven stubs. */
function laad(bestand, stubs = {}) {
  const js = ts.transpileModule(fs.readFileSync(bestand, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText
  const mod = { exports: {} }
  const eigenRequire = naam => {
    if (naam in stubs) return stubs[naam]
    return require(naam)
  }
  new Function('exports', 'require', 'module', js)(mod.exports, eigenRequire, mod)
  return mod.exports
}

const contract = laad(path.join(src, 'bezoek/contract.ts'))
// ROLLEN echt meegeven: bekendeVariabelen() bouwt daaruit de zes rolgroepen
// ({projectleider.naam} en broertjes). Met een lege lijst zou het script die ten
// onrechte als onbekend melden.
const rollen = laad(path.join(src, 'rollen.ts'))
const variabelen = laad(path.join(src, 'variabelen.ts'), { './rollen': rollen })

const bekend = variabelen.bekendeVariabelen()

// ── 1. Elke sleutel van het blok moet als {bezoek.<sleutel>} bekend zijn ────
const ontbreekt = []
for (const sleutel of Object.keys(contract.LEEG_BEZOEK_BLOK)) {
  if (!bekend.has(`bezoek.${sleutel}`)) ontbreekt.push(`bezoek.${sleutel}`)
}
// ── 2. Elk veld van een bevinding moet binnen de loop bekend zijn ───────────
for (const sleutel of Object.keys(contract.LEGE_BEVINDING)) {
  if (!bekend.has(sleutel)) ontbreekt.push(`(in loop) ${sleutel}`)
}

// ── 3. Elke tag in het gegenereerde sjabloon moet bekend zijn ───────────────
const sjabloon = path.join(repo, 'docs/document-sjablonen/Bezoekrapport.docx')
const onbekendInSjabloon = []
// Ontbreekt het sjabloon, dan is dat een FOUT en geen reden om die controle over te slaan:
// een stille pass verbergt precies het geval waarin het bestand per ongeluk is verdwenen.
if (!fs.existsSync(sjabloon)) {
  console.log('ONTBREEKT: docs/document-sjablonen/Bezoekrapport.docx')
  console.log('  Genereer hem opnieuw: node apps/dashboard/scripts/maak-bezoeksjabloon.mjs')
  process.exit(1)
}
{
  const xml = new PizZip(fs.readFileSync(sjabloon)).file('word/document.xml').asText()
  const tags = new Set([...xml.matchAll(/\{([#/^%@]?)([^}]{1,60})\}/g)].map(m => m[2].trim()))
  for (const tag of tags) {
    if (!bekend.has(tag)) onbekendInSjabloon.push(tag)
  }
}

let fout = false
if (ontbreekt.length) {
  console.log('ONTBREEKT in variabelen.ts (staat wel in het contract):')
  for (const v of ontbreekt) console.log(`  ${v}`)
  fout = true
}
if (onbekendInSjabloon.length) {
  console.log('ONBEKEND in variabelen.ts (staat wel in Bezoekrapport.docx):')
  for (const v of onbekendInSjabloon) console.log(`  ${v}`)
  fout = true
}
if (!fout) {
  console.log('OK - contract, sjabloon en variabelencatalogus lopen gelijk')
}
process.exit(fout ? 1 : 0)
