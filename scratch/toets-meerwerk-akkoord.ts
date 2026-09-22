/**
 * Toets op de meerwerkregel: welke regel mag op akkoord, en wanneer niet.
 *
 *   npx tsx ../../scratch/toets-meerwerk-akkoord.ts   (vanuit apps/dashboard)
 *
 * Leest alleen; er wordt niets op akkoord gezet. De toets gaat over de keuze die
 * `zetMeerwerkAkkoordUitBericht` maakt, en die keuze is bewust smal:
 *
 *   geen open regel  → actie voor de projectleider, EVA maakt er nooit zelf een
 *   precies één      → die mag op akkoord
 *   meer dan één     → actie met de vraag welke
 *
 * De reden voor die smalte is geld. Een meerwerkregel aanmaken betekent een bedrag
 * kiezen uit een bijlage; dat bedrag gaat via de bewakingscode naar Bouw7 en telt
 * mee in de contractsom. Twee regels op akkoord zetten omdat er één akkoord
 * binnenkwam is een boekhoudfout die niemand terugvindt.
 */
import fs from 'node:fs'
import path from 'node:path'

const env = fs.readFileSync(path.join(__dirname, '..', 'apps', 'dashboard', '.env.local'), 'utf-8')
for (const regel of env.split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(regel.trim())
  if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, '')
}

const OPEN = ['aangevraagd', 'offerte_verstuurd']

/** Dezelfde poort als in de module: meerwerk hoort bij werk dat lóópt. */
function magDoor(hoofdstatus: string | null, servicedeskSubstatus: string | null): boolean {
  return hoofdstatus === 'opdracht' || servicedeskSubstatus != null
}

/** Dezelfde keuze als in de module, los nagerekend op de echte database. */
function keuze(aantal: number): 'geen_regel' | 'akkoord' | 'meerdere' {
  if (aantal === 0) return 'geen_regel'
  if (aantal === 1) return 'akkoord'
  return 'meerdere'
}

async function main() {
  const { createAdminClient } = await import('@everts/database/server')
  const supabase = createAdminClient()

  let fouten = 0
  const toets = (naam: string, gelukt: boolean, detail = '') => {
    if (!gelukt) fouten++
    console.log(`  ${gelukt ? 'ok   ' : 'FOUT '} ${naam}${gelukt ? '' : ` — ${detail}`}`)
  }

  console.log('\n── Wat staat er in de database ──────────────────────────────')
  const { data: regels } = await supabase
    .from('meerwerk_regels')
    .select('dossier_id, status')
    .limit(1000)

  const perStatus = new Map<string, number>()
  for (const r of regels ?? []) perStatus.set(r.status, (perStatus.get(r.status) ?? 0) + 1)
  console.log(`  ${regels?.length ?? 0} meerwerkregels in totaal`)
  for (const [s, n] of [...perStatus].sort((a, b) => b[1] - a[1])) console.log(`    ${s.padEnd(20)} ${n}`)

  const openPerDossier = new Map<string, number>()
  for (const r of regels ?? []) {
    if (OPEN.includes(r.status)) openPerDossier.set(r.dossier_id, (openPerDossier.get(r.dossier_id) ?? 0) + 1)
  }

  console.log('\n── Wat zou EVA doen per dossier met open meerwerk ───────────')
  const verdeling = { geen_regel: 0, akkoord: 0, meerdere: 0 }
  for (const n of openPerDossier.values()) verdeling[keuze(n)]++
  console.log(`  precies één open regel : ${verdeling.akkoord} dossiers  → mag op akkoord`)
  console.log(`  meerdere open regels   : ${verdeling.meerdere} dossiers  → actie voor de PL`)
  console.log(`  dossiers zonder open regel vallen altijd in "geen_regel"`)

  console.log('\n── De keuze zelf ───────────────────────────────────────────')
  toets('nul regels vraagt om er een', keuze(0) === 'geen_regel')
  toets('één regel mag door', keuze(1) === 'akkoord')
  toets('twee regels is een vraag', keuze(2) === 'meerdere')
  toets('vijf regels ook', keuze(5) === 'meerdere')

  console.log('\n── Alleen op werk dat loopt ────────────────────────────────')
  // Een opdracht óf een servicedeskbon. Dat laatste is ook werk in uitvoering,
  // alleen op een ander bord: hoofdstatus blijft 'aanvraag' met een eigen ladder
  // ernaast. Op een aanvraag of offerte zónder die ladder is "meerwerk" gewoon
  // werk dat nog in de prijs hoort.
  const { data: fases } = await supabase
    .from('dossiers')
    .select('id, dossiernummer, hoofdstatus, servicedesk_substatus')
    .in('id', [...openPerDossier.keys()].slice(0, 50))

  const servicedesk = (fases ?? []).filter(
    d => d.hoofdstatus !== 'opdracht' && d.servicedesk_substatus != null,
  )
  const geweigerd = (fases ?? []).filter(
    d => d.hoofdstatus !== 'opdracht' && d.servicedesk_substatus == null,
  )

  console.log(`  ${servicedesk.length} servicedeskbon(nen) met open meerwerk — die mogen door`)
  for (const d of servicedesk) console.log(`      ${d.dossiernummer} (${d.servicedesk_substatus})`)
  console.log(`  ${geweigerd.length} dossier(s) die geweigerd worden`)
  for (const d of geweigerd) console.log(`      ${d.dossiernummer} (${d.hoofdstatus})`)

  // De poort mag niet zo streng staan dat er lopend werk buiten valt. Eén
  // vervallen offerte met een oude regel is geen probleem; servicedeskbonnen
  // weigeren wél, en dat is precies wat deze toets moet vangen.
  toets('servicedeskbonnen komen door de poort',
    servicedesk.every(d => magDoor(d.hoofdstatus, d.servicedesk_substatus)),
    'de poort weigert werk dat loopt')
  toets('een losse aanvraag of offerte wordt geweigerd',
    geweigerd.every(d => !magDoor(d.hoofdstatus, d.servicedesk_substatus)),
    'de poort laat een niet-lopend dossier door')

  console.log(fouten === 0 ? '\nAlles goed\n' : `\n${fouten} fout(en)\n`)
  process.exit(fouten === 0 ? 0 : 1)
}

void main().catch(e => { console.error(e); process.exit(1) })
