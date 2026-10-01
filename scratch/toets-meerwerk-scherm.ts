/**
 * Wat krijgt het behandelscherm te zien bij de meerwerkmail van Geo Hersbach?
 *
 *   npx tsx ../../scratch/toets-meerwerk-scherm.ts   (vanuit apps/dashboard)
 *
 * Leest alleen. De klacht was dat de opdrachtgever niet herkend zou zijn, terwijl
 * de database wél een relatie aan het bericht heeft hangen. Dit script laat zien
 * wat `getBerichtDetail` oplevert -- precies wat de pagina krijgt -- en welke route
 * het scherm daaruit afleidt.
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

const BERICHT = 'ab9844c7-902f-4cb4-a642-a17d7063cf93'

async function main() {
  const { getBerichtDetail } = await import('@/lib/mailintake/data')
  const { bepaalRoute } = await import('@/lib/mailintake/types')
  const { eisenVoor } = await import('@/lib/mailintake/veld-eisen')

  const d = await getBerichtDetail(BERICHT)
  if (!d) { console.log('bericht niet gevonden'); process.exit(1) }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const x = d as any
  const b = x.bericht

  console.log(`\n${b.onderwerp}\n`)
  console.log('── Wat de pagina binnenkrijgt ──────────────────────────────')
  console.log(`  status            : ${b.status}`)
  console.log(`  soort             : ${b.soort}`)
  console.log(`  relatie_id        : ${b.relatie_id}`)
  console.log(`  b.relatie         : ${JSON.stringify(b.relatie)}`)
  console.log(`  contactpersoon    : ${JSON.stringify(b.contactpersoon)}`)
  console.log(`  klant_naam gelezen: ${x.extractie?.velden?.klant_naam}`)
  console.log(`  ons offertenummer : ${x.extractie?.velden?.onze_offerte_referentie}`)

  const offertes = x.duplicaten.filter((k: { soort: string }) => k.soort === 'offerte_match')
  const meerwerk = x.duplicaten.filter((k: { soort: string }) => k.soort === 'meerwerk_kandidaat')
  const route = bepaalRoute(b.soort, offertes.length > 0, false)

  console.log('\n── Kandidaten ─────────────────────────────────────────────')
  for (const k of x.duplicaten) {
    console.log(`  ${Number(k.score).toFixed(2)}  ${String(k.soort).padEnd(18)} `
      + `${String(k.dossiernummer ?? '').padEnd(13)} ${(k.redenen ?? []).join(' · ')}`)
  }
  console.log(`\n  offerte_match: ${offertes.length} · meerwerk_kandidaat: ${meerwerk.length}`)

  console.log('\n── Wat het scherm ermee doet ──────────────────────────────')
  console.log(`  route             : ${route}`)
  const eisen = eisenVoor(route, b.soort)
  console.log(`  klant_naam telt als: ${eisen.klant_naam}`)
  console.log(`  De opdrachtgever wordt voorgevuld uit b.relatie?.id -> `
    + `${b.relatie?.id ? 'GEVULD' : 'LEEG'}`)

  console.log('\n── Is er een meerwerkknop? ────────────────────────────────')
  console.log(meerwerk.length > 0
    ? `  Ja, maar alleen rechts in het beoordelingspaneel, bij kandidaat `
      + `${meerwerk[0].dossiernummer} (score ${Number(meerwerk[0].score).toFixed(2)}).`
    : '  Nee: er is geen dossier als meerwerk-kandidaat gevonden.')
  console.log(`  In de sectie "Het dossier" van het formulier staat bij route `
    + `"${route}" geen meerwerkkeuze.\n`)
}

void main().catch(e => { console.error(e); process.exit(1) })
