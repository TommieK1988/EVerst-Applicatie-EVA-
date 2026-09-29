/**
 * Toets: staan servicedeskbonnen niet langer onder Aanvragen?
 *
 *   npx tsx ../../scratch/toets-mobiel-aanvragen.ts   (vanuit apps/dashboard)
 *
 * Leest alleen. Draait de échte query's van het mobiele dossierscherm per
 * medewerker en telt wat er in welke groep landt.
 *
 * WAT ER MIS WAS
 * `getMijnDossiers(..., 'aanvraag')` filterde alleen op hoofdstatus. Servicedesk is
 * géén eigen hoofdstatus maar een ladder ernaast: een bon heeft hoofdstatus
 * 'aanvraag' mét een `servicedesk_substatus`. Dus kwamen bonnen mee als aanvraag.
 *
 * Het mobiele scherm zet ze daarna in de groep waar ze het eerst opduiken, en dat is
 * Aanvragen -- `add(aanv, …)` gaat vóór `add(svc, …)` en `seen` houdt de tweede tegen.
 *
 * Dit ging lang onopgemerkt omdat er per medewerker zelden een bon binnen de
 * sorteervolgorde (updated_at, limit 100) viel. Toen 372 bonnen op één dag werden
 * bijgewerkt, stonden ze allemaal bovenaan.
 */
import fs from 'node:fs'
import path from 'node:path'

const env = fs.readFileSync(path.join(__dirname, '..', 'apps', 'dashboard', '.env.local'), 'utf-8')
for (const regel of env.split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(regel.trim())
  if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, '')
}

// `react.cache` bestaat alleen binnen de Next-runtime; buiten een request klapt elke
// module die het gebruikt al bij het importeren.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const React = require('react') as any
if (typeof React.cache !== 'function') React.cache = (fn: unknown) => fn

async function main() {
  const { createAdminClient } = await import('@everts/database/server')
  const { getMijnDossiers, getMijnServicedesk } = await import('@/lib/dossiers/actions')
  const supabase = createAdminClient()

  let fouten = 0
  const toets = (naam: string, gelukt: boolean, detail = '') => {
    if (!gelukt) fouten++
    console.log(`  ${gelukt ? 'ok   ' : 'FOUT '} ${naam}${gelukt ? '' : ` — ${detail}`}`)
  }

  // De medewerkers die daadwerkelijk aan bonnen hangen; anders toetst dit niets.
  const { data: mw } = await supabase
    .from('dossiers')
    .select('project_manager_id, uitvoerder_id')
    .not('servicedesk_substatus', 'is', null)
    .limit(1000)

  const ids = new Set<string>()
  for (const d of mw ?? []) {
    if (d.project_manager_id) ids.add(d.project_manager_id)
    if (d.uitvoerder_id) ids.add(d.uitvoerder_id)
  }

  const { data: namen } = await supabase
    .from('medewerkers')
    .select('id, voornaam, tussenvoegsel, achternaam')
    .in('id', [...ids])
    .limit(100)
  const naamVan = new Map(
    (namen ?? []).map(m => [m.id, [m.voornaam, m.tussenvoegsel, m.achternaam].filter(Boolean).join(' ')]),
  )

  console.log(`\n${ids.size} medewerkers met servicedeskbonnen op hun naam\n`)
  console.log('  medewerker                  aanvragen   waarvan bon   servicedesk')

  const SORT = { kolom: 'updated_at', ascending: false }
  let bonnenOnderAanvragen = 0

  for (const id of ids) {
    const [aanv, svc] = await Promise.all([
      getMijnDossiers(id, 'aanvraag', 100, SORT, undefined, true),
      getMijnServicedesk(id, 100, SORT, true),
    ])
    if (!aanv.ok || !svc.ok) continue

    // Een rij in de aanvragenlijst die een servicedesk-substatus heeft, hoort daar niet.
    const besmet = aanv.data.filter(
      (d: Record<string, unknown>) => d.servicedesk_substatus != null,
    ).length
    bonnenOnderAanvragen += besmet

    if (aanv.data.length || svc.data.length) {
      console.log(
        `  ${(naamVan.get(id) ?? id).slice(0, 26).padEnd(26)}`
        + `${String(aanv.data.length).padStart(9)}`
        + `${String(besmet).padStart(14)}`
        + `${String(svc.data.length).padStart(14)}`,
      )
    }
  }

  console.log('')
  toets('geen enkele bon staat nog onder Aanvragen', bonnenOnderAanvragen === 0,
    `${bonnenOnderAanvragen} bon(nen) kwamen mee in de aanvragenlijst`)

  // En de tegenproef: de bonnen moeten wél ergens staan.
  const { count: totaalBonnen } = await supabase
    .from('dossiers')
    .select('id', { count: 'exact', head: true })
    .not('servicedesk_substatus', 'is', null)
  console.log(`\n  ${totaalBonnen} bonnen in totaal; die horen via getMijnServicedesk in beeld te komen.`)

  console.log(fouten === 0 ? '\nAlles goed\n' : `\n${fouten} fout(en)\n`)
  process.exit(fouten === 0 ? 0 : 1)
}

void main().catch(e => { console.error(e); process.exit(1) })
