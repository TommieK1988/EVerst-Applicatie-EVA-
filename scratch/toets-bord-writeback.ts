/**
 * Toets: de aanvraag-/offerteladder trekt de Bouw7-projectstatus mee (30-09-2026).
 *
 *   npx tsx ../../scratch/toets-bord-writeback.ts   (vanuit apps/dashboard)
 *
 * SCHRIJFT naar Bouw7, alleen op testproject 4202130 ("Test dossier TOM"). Leest eerst de
 * stand, en zet projectstatus + maatwerkveld aan het eind terug (ook bij een fout).
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

const TEST_PROJECT = 4202130

async function main() {
  const { getBouw7Client } = await import('@/lib/bouw7/sync')
  const { schrijfBouw7Substatus, BOUW7_SUBSTATUS_ATTR_ID } = await import('@/lib/bouw7/substatus-attr')
  const { schrijfBouw7Projectstatusprefix } = await import('@/lib/dossiers/bouw7-status')
  const { mergeCustomAttributeValue } = await import('@/lib/bouw7/custom-attributes')

  const client = await getBouw7Client()
  type P = { type?: number; status?: { id: number; name: string }; customAttributeValues?: { customAttribute?: { id?: number }; value?: string }[] }
  const lees = async () => {
    const p = await client.get<P>(`/project/${TEST_PROJECT}`)
    const label = p.customAttributeValues?.find(v => v.customAttribute?.id === BOUW7_SUBSTATUS_ATTR_ID)?.value ?? ''
    return { p, status: (p.status?.name ?? '').trim(), label }
  }

  const start = await lees()
  console.log(`start: status "${start.status}", substatus "${start.label}"`)

  let fouten = 0
  const toets = (naam: string, ok: boolean, detail = '') => {
    if (!ok) fouten++
    console.log(`  ${ok ? 'ok   ' : 'FOUT '} ${naam}${ok ? '' : ` — ${detail}`}`)
  }

  try {
    // Uitgangspunt: project op 01, zodat de regels vanuit de aanvraagfase gelden.
    await schrijfBouw7Projectstatusprefix(TEST_PROJECT, '01.')

    let r = await schrijfBouw7Substatus(TEST_PROJECT, 'offerte', 'verzonden', null, { forceer: true })
    let nu = await lees()
    toets('Verzonden → 09', r.ok && nu.status.startsWith('09'), `${JSON.stringify(r)} / ${nu.status}`)
    toets('Verzonden meldt de status terug (cache)', r.ok && r.projectstatus?.naam.startsWith('09') === true, JSON.stringify(r))

    r = await schrijfBouw7Substatus(TEST_PROJECT, 'offerte', 'nabellen', null, { forceer: true })
    nu = await lees()
    toets('Actie op 09 laat de status staan', r.ok && !r.projectstatus && nu.status.startsWith('09'), `${JSON.stringify(r)} / ${nu.status}`)

    r = await schrijfBouw7Substatus(TEST_PROJECT, 'aanvraag', 'offerte_gereed', null, { forceer: true })
    nu = await lees()
    toets('terug naar Offerte gereed → 01', r.ok && nu.status.startsWith('01'), `${JSON.stringify(r)} / ${nu.status}`)

    r = await schrijfBouw7Substatus(TEST_PROJECT, 'aanvraag', 'afgewezen', null, { forceer: true })
    nu = await lees()
    console.log(`  (afgewezen aanvraag → ${nu.status}; 08 alleen als het project geen levende offerte heeft)`)
    toets('afgewezen aanvraag schrijft zonder fout', r.ok, JSON.stringify(r))

    r = await schrijfBouw7Substatus(TEST_PROJECT, 'aanvraag', 'nieuw', null, { forceer: true })
    nu = await lees()
    toets('terug naar Nieuw → 01', r.ok && nu.status.startsWith('01'), `${JSON.stringify(r)} / ${nu.status}`)

    // Nooit terugzetten vanuit de opdrachtfase.
    await schrijfBouw7Projectstatusprefix(TEST_PROJECT, '04.')
    r = await schrijfBouw7Substatus(TEST_PROJECT, 'aanvraag', 'werkopname', null, { forceer: true })
    nu = await lees()
    toets('op 04 laat een aanvraagstap de status staan', r.ok && nu.status.startsWith('04'), `${JSON.stringify(r)} / ${nu.status}`)
  } finally {
    // Terugzetten: projectstatus en maatwerkveld zoals ze waren.
    const prefix = start.status.slice(0, 3)
    if (prefix) await schrijfBouw7Projectstatusprefix(TEST_PROJECT, prefix)
    const huidig = await lees()
    await client.post('/project', {
      id: TEST_PROJECT,
      type: huidig.p.type,
      customAttributeValues: mergeCustomAttributeValue(
        (huidig.p.customAttributeValues ?? []) as never, BOUW7_SUBSTATUS_ATTR_ID, start.label),
    })
    const eind = await lees()
    console.log(`eind : status "${eind.status}", substatus "${eind.label}"`)
    toets('stand teruggezet', eind.status === start.status && eind.label === start.label)
  }

  console.log(fouten === 0 ? '\nAlles goed\n' : `\n${fouten} fout(en)\n`)
  process.exit(fouten === 0 ? 0 : 1)
}

void main().catch(e => { console.error(e); process.exit(1) })
