/**
 * Eenmalig (30-09-2026): Bouw7-projectstatus gelijktrekken met de nieuwe bordregels.
 *
 *   npx tsx ../../scratch/opruimen-bord-bouw7.ts              droogloop (leest alleen)
 *   npx tsx ../../scratch/opruimen-bord-bouw7.ts --uitvoeren  schrijft naar Bouw7 + EVA-kopie
 *
 *  A. Lopende offertes (hoofdstatus offerte) die in Bouw7 nog op '01. Offerte' staan → '09.'
 *     Tot vandaag trok Verzonden de projectstatus niet mee.
 *  B. Afgewezen/vervallen aanvragen op '01.' → '08. Afgewezen', alleen als het project geen
 *     levende offerte meer heeft (zelfde regel als bij een wijziging in EVA).
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

const UITVOEREN = process.argv.includes('--uitvoeren')

async function main() {
  const { createAdminClient } = await import('@everts/database/server')
  const { getBouw7Client } = await import('@/lib/bouw7/sync')
  const { schrijfBouw7Projectstatusprefix, projectstatusCacheVelden } = await import('@/lib/dossiers/bouw7-status')
  const supabase = createAdminClient()
  const client = await getBouw7Client()

  const { data: a } = await supabase.from('dossiers')
    .select('id, dossiernummer, titel, offerte_substatus, bouw7_id, bouw7_projectstatus_naam')
    .eq('hoofdstatus', 'offerte').like('bouw7_projectstatus_naam', '01.%').not('bouw7_id', 'is', null)
    .order('dossiernummer')
  const { data: b } = await supabase.from('dossiers')
    .select('id, dossiernummer, titel, aanvraag_substatus, bouw7_id, bouw7_projectstatus_naam')
    .eq('hoofdstatus', 'aanvraag').in('aanvraag_substatus', ['afgewezen', 'vervallen'])
    .is('servicedesk_substatus', null)
    .like('bouw7_projectstatus_naam', '01.%').not('bouw7_id', 'is', null)
    .order('dossiernummer')

  const plan: { id: string; nr: string; titel: string; bouw7Id: string; naar: string; reden: string }[] = []

  for (const d of a ?? []) {
    plan.push({ id: d.id, nr: d.dossiernummer ?? '', titel: d.titel ?? '', bouw7Id: d.bouw7_id!, naar: '09.', reden: `offerte ${d.offerte_substatus}` })
  }
  for (const d of b ?? []) {
    const res = await client.get<{ items?: { quotationStatus?: { name?: string } }[] }>('/list/quotations', { q: `project.id = ${Number(d.bouw7_id)}` })
    const levend = (res.items ?? []).filter(q => !/verloren|vervallen/i.test(q.quotationStatus?.name ?? ''))
    if (levend.length) {
      console.log(`  overslaan ${d.dossiernummer}: nog ${levend.length} levende offerte(s)`)
      continue
    }
    plan.push({ id: d.id, nr: d.dossiernummer ?? '', titel: d.titel ?? '', bouw7Id: d.bouw7_id!, naar: '08.', reden: `aanvraag ${d.aanvraag_substatus}` })
  }

  console.log(`\n${UITVOEREN ? 'UITVOEREN' : 'DROOGLOOP'} — ${plan.length} projecten\n`)
  let fout = 0
  for (const p of plan) {
    const regel = `  ${p.nr}  → ${p.naar}  (${p.reden})  ${p.titel.slice(0, 60)}`
    if (!UITVOEREN) { console.log(regel); continue }
    const res = await schrijfBouw7Projectstatusprefix(p.bouw7Id, p.naar)
    if (!res.ok) { fout++; console.log(`${regel}  FOUT ${res.error}`); continue }
    await supabase.from('dossiers').update(projectstatusCacheVelden(res) as never).eq('id', p.id)
    console.log(`${regel}  ok`)
  }
  console.log(fout ? `\n${fout} fout(en)` : '\nklaar')
  process.exit(fout ? 1 : 0)
}

void main().catch(e => { console.error(e); process.exit(1) })
