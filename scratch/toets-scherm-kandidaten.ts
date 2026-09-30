/**
 * Toets: toont het behandelscherm de juiste offerte, zonder opnieuw te laten lezen?
 *
 *   npx tsx ../../scratch/toets-scherm-kandidaten.ts   (vanuit apps/dashboard)
 *
 * Leest alleen, geen AI-aanroep. Roept `getBerichtDetail` aan -- precies wat de
 * pagina doet -- en kijkt naar de kandidaten die het scherm krijgt.
 *
 * WAT ER MIS WAS
 * De duplicaatkandidaten worden vastgelegd op het moment dat de mail wordt verwerkt.
 * Een verbetering aan de matching bereikte een bericht dat al binnen was dus nooit:
 * het scherm bleef "er is geen offerte gevonden die hierbij hoort" tonen terwijl het
 * zoeken op ons eigen offertenummer allang werkte. De enige uitweg was "Opnieuw
 * laten lezen", en dat doet een dure AI-lezing voor iets wat een paar queries is.
 */
import fs from 'node:fs'
import path from 'node:path'

const env = fs.readFileSync(path.join(__dirname, '..', 'apps', 'dashboard', '.env.local'), 'utf-8')
for (const regel of env.split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(regel.trim())
  if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, '')
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const React = require('react') as any
if (typeof React.cache !== 'function') React.cache = (fn: unknown) => fn

const BERICHT = 'ef8d2dce-746e-40f2-b441-21afdbcc2561'

async function main() {
  const { getBerichtDetail } = await import('@/lib/mailintake/data')

  let fouten = 0
  const toets = (naam: string, gelukt: boolean, detail = '') => {
    if (!gelukt) fouten++
    console.log(`  ${gelukt ? 'ok   ' : 'FOUT '} ${naam}${gelukt ? '' : ` -- ${detail}`}`)
  }

  const detail = await getBerichtDetail(BERICHT)
  if (!detail) { console.log('bericht niet gevonden'); process.exit(1) }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = detail as any
  console.log(`\n${d.bericht.onderwerp}`)
  console.log(`status: ${d.bericht.status}\n`)
  console.log('  score  soort              dossier       redenen')
  for (const k of d.duplicaten) {
    console.log(`  ${Number(k.score).toFixed(2)}   ${String(k.soort).padEnd(18)} `
      + `${String(k.dossiernummer ?? '').padEnd(13)} ${(k.redenen ?? []).join(' - ')}`)
  }
  console.log('')

  const juiste = d.duplicaten.find((k: { dossiernummer: string }) => k.dossiernummer === '20267.00682')
  toets('het scherm krijgt het dossier van OFT-2026-171', Boolean(juiste))
  toets('als offerte_match, dus met de knop "Offerte op gewonnen zetten"',
    juiste?.soort === 'offerte_match', String(juiste?.soort))
  toets('met de reden erbij', Boolean(juiste?.redenen?.some((r: string) => r.includes('OFT-2026-171'))))

  console.log(fouten === 0 ? '\nAlles goed\n' : `\n${fouten} fout(en)\n`)
  process.exit(fouten === 0 ? 0 : 1)
}

void main().catch(e => { console.error(e); process.exit(1) })
