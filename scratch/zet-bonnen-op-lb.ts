/**
 * Zet bestaande servicedeskbonnen in Bouw7 op de juiste projectstatus.
 *
 *   npx tsx ../../scratch/zet-bonnen-op-lb.ts          (droogloop, raakt niets aan)
 *   npx tsx ../../scratch/zet-bonnen-op-lb.ts --doen   (voert het uit)
 *
 * DIT SCHRIJFT NAAR BOUW7
 * Voor iedereen die daar kijkt verplaatsen de bonnen zichtbaar van lijst. Vandaar de
 * droogloop als standaard.
 *
 * DE REGEL
 * Servicedeskbonnen horen in Bouw7 op "LB. Lopende bonnen"; de fasering loopt in EVA.
 * Bij het eind lopen ze weer gelijk: `financieel_gereed` hoort op "06. Financieel
 * gereed". Nieuwe bonnen doen dat sinds deze week vanzelf; dit script haalt de
 * bestaande bij.
 *
 * WAT ER NIET WORDT AANGERAAKT
 *  - Bonnen die al op LB staan.
 *  - "06. Financieel gereed" die in EVA ook financieel gereed is: klopt al.
 *  - **"08. Afgewezen".** Dat is een bewuste eindstatus in Bouw7 en geen fase van de
 *    bon; die naar LB of 06 trekken zou een afwijzing ongedaan maken.
 *
 * WAAROM ER OOK IN EVA IETS GEBEURT
 * De lees-sync vertaalt LB naar de kolom "Loopt". Zet ik alleen de Bouw7-kant om, dan
 * schuift de eerstvolgende sync 58 bonnen die op "Uitgevoerd" staan terug naar "Loopt"
 * -- de wijziging zou de boel dus juist slechter maken. Daarom wordt per bon eerst
 * `servicedesk_substatus` als handmatig gemarkeerd; dat is hetzelfde mechanisme dat een
 * met de hand versleepte bon beschermt. Eerst markeren, dán schrijven: een sync tussen
 * de twee stappen door vindt de kolom dan al beschermd.
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

const DOEN = process.argv.includes('--doen')

/** Bouw7-statussen die we met rust laten, wat EVA er ook van zegt. */
const NIET_AANRAKEN = ['08. Afgewezen', '07.']

async function main() {
  const { createAdminClient } = await import('@everts/database/server')
  const { schrijfBouw7Projectstatusprefix } = await import('@/lib/dossiers/bouw7-status')
  const { markeerHandmatig } = await import('@/lib/bouw7/handmatige-velden')
  const supabase = createAdminClient()

  const { data: rijen } = await supabase
    .from('dossiers')
    .select('id, dossiernummer, titel, bouw7_id, servicedesk_substatus, bouw7_projectstatus_naam, handmatige_velden')
    .not('servicedesk_substatus', 'is', null)
    .not('bouw7_id', 'is', null)
    .order('dossiernummer')
    .limit(1000)

  const bonnen = rijen ?? []
  console.log(`\n${bonnen.length} servicedeskbonnen met een Bouw7-project.\n`)

  type Klus = { id: string; nr: string | null; bouw7Id: string; van: string; naar: string; eva: string }
  const klussen: Klus[] = []
  let alGoed = 0
  let overgeslagen = 0

  for (const b of bonnen) {
    const nu = (b.bouw7_projectstatus_naam ?? '').trim()
    if (NIET_AANRAKEN.some(v => nu.startsWith(v))) { overgeslagen++; continue }

    const doel = b.servicedesk_substatus === 'financieel_gereed' ? '06.' : 'LB.'
    const staatAlGoed = doel === 'LB.' ? nu === 'LB. Lopende bonnen' : nu.startsWith('06.')
    if (staatAlGoed) { alGoed++; continue }

    klussen.push({
      id: b.id,
      nr: b.dossiernummer,
      bouw7Id: String(b.bouw7_id),
      van: nu || '(leeg)',
      naar: doel === 'LB.' ? 'LB. Lopende bonnen' : '06. Financieel gereed',
      eva: b.servicedesk_substatus as string,
    })
  }

  console.log(`  staat al goed : ${alGoed}`)
  console.log(`  niet aanraken : ${overgeslagen}  (08. Afgewezen / 07.)`)
  console.log(`  aan te passen : ${klussen.length}\n`)

  // Gegroepeerd tonen; 112 losse regels leest niemand.
  const perOvergang = new Map<string, Klus[]>()
  for (const k of klussen) {
    const sleutel = `${k.van}  →  ${k.naar}`
    perOvergang.set(sleutel, [...(perOvergang.get(sleutel) ?? []), k])
  }
  for (const [overgang, lijst] of [...perOvergang].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${String(lijst.length).padStart(3)}x  ${overgang}`)
    const perEva = new Map<string, number>()
    for (const k of lijst) perEva.set(k.eva, (perEva.get(k.eva) ?? 0) + 1)
    for (const [eva, n] of perEva) console.log(`         ${n}x EVA-kolom "${eva}"`)
  }

  if (!DOEN) {
    console.log('\nDroogloop. Draai met --doen om het uit te voeren.\n')
    return
  }

  console.log('\nUitvoeren…\n')
  let gelukt = 0
  const mislukt: string[] = []

  for (const k of klussen) {
    // Eerst de EVA-kolom beschermen. Zonder dit zou de sync de bon na de statuswissel
    // naar "Loopt" trekken -- juist bij de 58 die op "Uitgevoerd" staan.
    if (k.naar.startsWith('LB.')) {
      const velden = await markeerHandmatig(supabase, 'dossiers', k.id, ['servicedesk_substatus'])
      if (velden) {
        await supabase.from('dossiers').update({ handmatige_velden: velden } as never).eq('id', k.id)
      }
    }

    const prefix = k.naar.startsWith('LB.') ? 'LB.' : '06.'
    const res = await schrijfBouw7Projectstatusprefix(k.bouw7Id, prefix)
    if (res.ok) {
      gelukt++
      await supabase
        .from('dossiers')
        .update({ bouw7_projectstatus_naam: res.projectstatus?.naam ?? k.naar } as never)
        .eq('id', k.id)
    } else {
      mislukt.push(`${k.nr}: ${res.error}`)
    }
    if ((gelukt + mislukt.length) % 20 === 0) {
      console.log(`  ${gelukt + mislukt.length} van ${klussen.length}…`)
    }
  }

  console.log(`\ngelukt ${gelukt} · mislukt ${mislukt.length}`)
  for (const m of mislukt.slice(0, 15)) console.log(`  ${m}`)
  console.log()
}

void main().catch(e => { console.error(e); process.exit(1) })
