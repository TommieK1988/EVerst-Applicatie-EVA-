/**
 * Toets: de vier bordqueries op de kolom `bord` (30-09-2026). Leest alleen.
 *
 *   npx tsx ../../scratch/toets-borden.ts   (vanuit apps/dashboard)
 *
 * Draait de echte server-queries en telt per bord en per kolom, plus: hoeveel kaarten zouden in
 * geen enkele kolom passen (die krijgen nu een waarschuwing in de eerste kolom).
 */
import fs from 'node:fs'
import path from 'node:path'

const env = fs.readFileSync(path.join(__dirname, '..', 'apps', 'dashboard', '.env.local'), 'utf-8')
for (const regel of env.split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(regel.trim())
  if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, '')
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const react = require('react'); if (typeof react.cache !== 'function') react.cache = (fn: unknown) => fn

async function main() {
  const a = await import('@/lib/dossiers/actions')
  const t = await import('@/components/dossiers/types')

  const borden = [
    { naam: 'Aanvragen', res: await a.getDossiersVoorAanvragen(), sectie: 'aanvraag', kolommen: t.AANVRAAG_STATUSSEN },
    { naam: 'Offertes', res: await a.getDossiersVoorOffertes(), sectie: 'offerte', kolommen: t.OFFERTE_STATUSSEN },
    { naam: 'Opdrachten', res: await a.getDossiersVoorOpdrachten(), sectie: 'opdracht', kolommen: t.OPDRACHT_KANBAN_STATUSSEN },
    { naam: 'Servicedesk', res: await a.getDossiersVoorServicedesk(), sectie: 'servicedesk', kolommen: null },
    { naam: 'Afgesloten-tab', res: await a.getDossiersAfgeslotenAlle(), sectie: 'x', kolommen: null },
  ]

  let fouten = 0
  for (const b of borden) {
    if (!b.res.ok) { fouten++; console.log(`FOUT ${b.naam}: ${b.res.error}`); continue }
    const rijen = b.res.data
    console.log(`\n── ${b.naam}: ${rijen.length} dossiers`)
    if (!b.kolommen) continue
    const geldig = new Set(b.kolommen.map(k => k.key as string))
    const telling = new Map<string, number>()
    const afwijkend: string[] = []
    for (const d of rijen) {
      const key = b.sectie === 'offerte' && d.hoofdstatus === 'opdracht' && d.bord === 'opdrachten' ? 'gewonnen' : t.getDossierSubstatus(d)
      if (!geldig.has(key)) afwijkend.push(`${d.dossiernummer} (${d.hoofdstatus}/${key}, Bouw7 ${d.bouw7_projectstatus_naam})`)
      telling.set(key, (telling.get(key) ?? 0) + 1)
    }
    for (const k of b.kolommen) console.log(`   ${String(k.label).padEnd(26)} ${telling.get(k.key) ?? 0}`)
    if (afwijkend.length) {
      console.log(`   → ${afwijkend.length} met waarschuwing in de eerste kolom:`)
      for (const x of afwijkend) console.log(`      ${x}`)
    }
  }

  console.log(fouten === 0 ? '\nAlle queries gelukt\n' : `\n${fouten} fout(en)\n`)
  process.exit(fouten === 0 ? 0 : 1)
}

void main().catch(e => { console.error(e); process.exit(1) })
