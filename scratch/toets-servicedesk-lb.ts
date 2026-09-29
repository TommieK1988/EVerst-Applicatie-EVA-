/**
 * Toets: een verse servicedeskbon staat in Bouw7 op LB en blijft in EVA op Nieuw.
 *
 *   npx tsx ../../scratch/toets-servicedesk-lb.ts   (vanuit apps/dashboard)
 *
 * Leest alleen; er wordt geen Bouw7-status geschreven.
 *
 * WAAR HET OM DRAAIT
 * Servicedeskbonnen horen in Bouw7 op "LB. Lopende bonnen" te staan, en de fasering
 * -- nieuw, uitgezet, uitgevoerd, financieel gereed -- gebeurt alleen in EVA.
 *
 * Die twee bijten elkaar zonder bescherming. `BOUW7_NAAR_SERVICEDESK_SUBSTATUS`
 * vertaalt LB naar `loopt`, dus de lees-sync (2x per dag) zou een verse bon van de
 * kolom "Nieuw" naar "Onderhanden" schuiven zonder dat iemand iets deed. Vandaar dat
 * de aanmaakroute `servicedesk_substatus` meteen als handmatig markeert -- hetzelfde
 * mechanisme dat een met de hand versleepte bon al beschermde.
 *
 * Deze toets kijkt naar alle drie: de fasetabel, de afleiding, en de bescherming
 * zoals die in de database staat.
 */
import fs from 'node:fs'
import path from 'node:path'

const env = fs.readFileSync(path.join(__dirname, '..', 'apps', 'dashboard', '.env.local'), 'utf-8')
for (const regel of env.split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(regel.trim())
  if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, '')
}

async function main() {
  const { createAdminClient } = await import('@everts/database/server')
  const { FASE_PLAATSINGEN } = await import('@/components/dossiers/fase-plaatsing')
  const { mapBouw7NaarEvaStatus, BOUW7_NAAR_SERVICEDESK_SUBSTATUS } =
    await import('@/lib/bouw7/status-afleiding')
  const { BOUW7_DOSSIER_VELDEN } = await import('@/lib/bouw7/handmatige-velden')

  let fouten = 0
  const toets = (naam: string, gelukt: boolean, detail = '') => {
    if (!gelukt) fouten++
    console.log(`  ${gelukt ? 'ok   ' : 'FOUT '} ${naam}${gelukt ? '' : ` — ${detail}`}`)
  }

  console.log('\n── Waar een verse bon heen gaat ────────────────────────────')
  const sd = FASE_PLAATSINGEN.servicedesk
  console.log(`  Bouw7  : ${sd.bouw7Status}   (prefix ${sd.bouw7Prefix ?? '-'})`)
  console.log(`  EVA    : ${sd.kolommen.hoofdstatus} / servicedesk ${sd.kolommen.servicedesk_substatus}`)
  toets('Bouw7 krijgt Lopende bonnen', sd.bouw7Status === 'LB. Lopende bonnen', sd.bouw7Status)
  toets('op de prefix LB.', sd.bouw7Prefix === 'LB.', String(sd.bouw7Prefix))
  toets('en niet meer via een opdracht-substatus', sd.bouw7Via === null, String(sd.bouw7Via))
  toets('EVA zet de bon op Nieuw', sd.kolommen.servicedesk_substatus === 'nieuw')

  console.log('\n── Wat de lees-sync ervan zou maken ────────────────────────')
  const uitLB = BOUW7_NAAR_SERVICEDESK_SUBSTATUS['LB. Lopende bonnen']
  console.log(`  LB. Lopende bonnen → ${uitLB}`)
  const afgeleid = mapBouw7NaarEvaStatus('LB. Lopende bonnen', 'Dagelijks onderhoud', null, null, null)
  console.log(`  afleiding          → ${afgeleid.servicedesk_substatus}`)
  toets('de afleiding wijkt af van wat EVA neerzet', afgeleid.servicedesk_substatus !== 'nieuw',
    'als dit gelijk is, is de bescherming niet nodig en klopt deze toets niet meer')

  console.log('\n── De bescherming ──────────────────────────────────────────')
  toets('servicedesk_substatus staat in de beschermbare velden',
    (BOUW7_DOSSIER_VELDEN as readonly string[]).includes('servicedesk_substatus'))

  const supabase = createAdminClient()

  // Zonder de markering zou de sync de bon verschuiven. Meet hoeveel bonnen die
  // bescherming nu hebben, zodat zichtbaar is of de aanmaakroute hem echt zet.
  const { data: bonnen } = await supabase
    .from('dossiers')
    .select('dossiernummer, servicedesk_substatus, bouw7_projectstatus_naam, handmatige_velden, created_at')
    .not('servicedesk_substatus', 'is', null)
    .order('created_at', { ascending: false })
    .limit(40)

  const rijen = bonnen ?? []
  const beschermd = rijen.filter(r => (r.handmatige_velden ?? []).includes('servicedesk_substatus'))
  console.log(`  ${beschermd.length} van de laatste ${rijen.length} bonnen is beschermd`)

  console.log('\n── Bonnen die nu zouden verschuiven bij een sync ───────────')
  // Onbeschermd én de afleiding zegt iets anders dan wat er staat: die springt.
  const springers = rijen.filter(r => {
    if ((r.handmatige_velden ?? []).includes('servicedesk_substatus')) return false
    const zou = BOUW7_NAAR_SERVICEDESK_SUBSTATUS[r.bouw7_projectstatus_naam ?? '']
    return zou != null && zou !== r.servicedesk_substatus
  })
  if (!springers.length) console.log('  geen')
  for (const r of springers.slice(0, 10)) {
    const zou = BOUW7_NAAR_SERVICEDESK_SUBSTATUS[r.bouw7_projectstatus_naam ?? '']
    console.log(`  ${r.dossiernummer}  ${r.servicedesk_substatus} → ${zou}   (${r.bouw7_projectstatus_naam})`)
  }
  console.log(`  ${springers.length} in totaal — dit zijn bestaande bonnen, niet het gevolg van deze wijziging`)

  console.log(fouten === 0 ? '\nAlles goed\n' : `\n${fouten} fout(en)\n`)
  process.exit(fouten === 0 ? 0 : 1)
}

void main().catch(e => { console.error(e); process.exit(1) })
