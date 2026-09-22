/**
 * Toets: heeft elk veld dat EVA uit een mail leest een bestemming?
 *
 *   npx tsx ../../scratch/toets-veld-bestemmingen.ts   (vanuit apps/dashboard)
 *
 * Draait zonder database en zonder netwerk. Vergelijkt `extractieSchema` met
 * `VELD_BESTEMMING` in beide richtingen:
 *
 *   een veld zonder regel   → er is iets toegevoegd aan het schema en vergeten
 *                             weg te schrijven; dat is onzichtbaar in productie
 *   een regel zonder veld   → de tabel loopt achter op het schema
 *
 * De aanleiding: het contact ter plaatse uit de opdrachtbon van 20261.00282 kwam
 * netjes uit het model, werd opgeslagen in `mailintake_extracties`, en landde
 * nergens. Geen foutmelding, geen signaal -- alleen een leeg Werkadres-blok.
 */
import { extractieSchema } from '@/lib/mailintake/schema'
import { VELD_BESTEMMING } from '@/lib/mailintake/bestemmingen'

function main() {
  const velden = Object.keys((extractieSchema as unknown as { shape: Record<string, unknown> }).shape)
  const beschreven = Object.keys(VELD_BESTEMMING)

  let fouten = 0
  const toets = (naam: string, gelukt: boolean, detail = '') => {
    if (!gelukt) fouten++
    console.log(`  ${gelukt ? 'ok   ' : 'FOUT '} ${naam}${gelukt ? '' : ` — ${detail}`}`)
  }

  console.log(`\n── ${velden.length} velden in het schema ─────────────────────────`)

  const zonderRegel = velden.filter(v => !(v in VELD_BESTEMMING))
  toets('elk veld heeft een bestemming', zonderRegel.length === 0,
    `geen regel voor: ${zonderRegel.join(', ')}`)

  const verweesd = beschreven.filter(v => !velden.includes(v))
  toets('elke regel hoort bij een veld', verweesd.length === 0,
    `staat niet (meer) in het schema: ${verweesd.join(', ')}`)

  console.log('\n── Waar alles heen gaat ────────────────────────────────────')
  const perSoort = new Map<string, string[]>()
  for (const [veld, b] of Object.entries(VELD_BESTEMMING)) {
    perSoort.set(b.waar, [...(perSoort.get(b.waar) ?? []), veld])
  }
  for (const [soort, lijst] of [...perSoort].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${soort.padEnd(11)} ${lijst.length}`)
  }

  console.log('\n── Wat nergens heen gaat ───────────────────────────────────')
  const ongebruikt = Object.entries(VELD_BESTEMMING)
    .filter(([, b]) => b.waar === 'ongebruikt')
  if (!ongebruikt.length) console.log('  niets')
  for (const [veld, b] of ongebruikt) {
    console.log(`  ${veld}`)
    console.log(`      ${(b as { reden: string }).reden}`)
  }
  // Een lege reden verbergt een gat achter een categorie.
  toets('elk ongebruikt veld heeft een reden',
    ongebruikt.every(([, b]) => ((b as { reden: string }).reden ?? '').trim().length > 10),
    'een "ongebruikt" zonder uitleg is gewoon een vergeten veld')

  console.log(fouten === 0 ? '\nAlles goed\n' : `\n${fouten} fout(en)\n`)
  process.exit(fouten === 0 ? 0 : 1)
}

main()
