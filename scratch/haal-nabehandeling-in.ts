/**
 * Haalt de achterstand in de Outlook-nabehandeling in.
 *
 *   npx tsx ../../scratch/haal-nabehandeling-in.ts          (laat zien wat er zou gebeuren)
 *   npx tsx ../../scratch/haal-nabehandeling-in.ts --doen   (voert het uit)
 *
 * DIT VERANDERT IETS IN ANDERMANS MAILBOX
 * Behandelde post gaat naar de map "Verwerkt door EVA" en wordt op gelezen gezet.
 * Vandaar de droogloop als standaard: zonder `--doen` wordt er niets aangeraakt.
 *
 * WAT ER MIS WAS
 * Acht berichten stonden op `outlook_nabehandeling = 'mislukt'` en bleven daar
 * eindeloos staan. Zes met `HTTP 404 ErrorItemNotFound`, twee zonder Graph-id.
 * Dat was geen storing maar het gevolg van een eigenschap van Graph: het
 * bericht-id verandert zodra de mail van map wisselt -- door onze eigen
 * verplaatsing, of doordat een collega hem in Outlook versleept. Opnieuw proberen
 * met het opgeslagen id kon dus nooit lukken.
 *
 * `voerNabehandelingUit` zoekt het bericht nu eerst opnieuw op via
 * `internet_message_id`, en dat id reist wél met het bericht mee.
 *
 * De regel blijft overeind: een bericht dat de AI als "geen aanvraag" bestempelde
 * wordt niet verplaatst maar alleen gecategoriseerd. Dat oordeel heeft niemand
 * gezien, en een gemiste aanvraag is de duurste fout. Dit script beslist daar niets
 * over -- `bepaalNabehandeling` doet dat, net als in de gewone verwerking.
 */
import fs from 'node:fs'
import path from 'node:path'

const env = fs.readFileSync(path.join(__dirname, '..', 'apps', 'dashboard', '.env.local'), 'utf-8')
for (const regel of env.split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(regel.trim())
  if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, '')
}

const DOEN = process.argv.includes('--doen')

async function main() {
  const { createAdminClient } = await import('@everts/database/server')
  const { voerNabehandelingUit, haalNabehandelStand } = await import('@/lib/mailintake/nabehandeling')
  const supabase = createAdminClient()

  const stand = await haalNabehandelStand()
  console.log(`\nNoodrem staat op: ${stand}${stand === 'aan' ? ' (categoriseren én verplaatsen)' : ''}`)

  const { data: rijen } = await supabase
    .from('mailintake_berichten')
    .select('id, onderwerp, status, outlook_nabehandeling, postbus:mailintake_postbussen(sleutel)')
    .in('status', ['verwerkt', 'genegeerd', 'geen_aanvraag'])
    .neq('outlook_nabehandeling', 'gedaan')
    .order('ontvangen_op')
    .limit(200)

  const achterstand = rijen ?? []
  if (!achterstand.length) {
    console.log('\nGeen achterstand: alles staat al op "gedaan".\n')
    return
  }

  console.log(`${achterstand.length} bericht(en) met een openstaande nabehandeling:\n`)
  for (const b of achterstand) {
    const pb = (b.postbus as unknown as { sleutel: string } | null)?.sleutel ?? '?'
    console.log(`  [${pb}] ${b.status.padEnd(14)} ${b.outlook_nabehandeling}  ${b.onderwerp ?? ''}`)
  }

  if (!DOEN) {
    console.log('\nDroogloop. Draai met --doen om het uit te voeren.\n')
    return
  }

  console.log('\nUitvoeren…\n')
  let gedaan = 0
  let overgeslagen = 0
  const fouten: string[] = []

  for (const b of achterstand) {
    const res = await voerNabehandelingUit(b.id)
    const kop = `  ${(b.onderwerp ?? '').slice(0, 64)}`
    if (res.gedaan) {
      gedaan++
      console.log(`${kop}\n      gedaan${res.nieuwGraphId ? ' (nieuw Graph-id opgeslagen)' : ''}`)
    } else if (res.overgeslagen) {
      overgeslagen++
      console.log(`${kop}\n      overgeslagen: ${res.fout ?? 'hoeft niets'}`)
    } else {
      fouten.push(`${b.onderwerp}: ${res.fout ?? 'onbekend'}`)
      console.log(`${kop}\n      MISLUKT: ${res.fout ?? 'onbekend'}`)
    }
  }

  console.log(`\ngedaan ${gedaan} · overgeslagen ${overgeslagen} · mislukt ${fouten.length}\n`)
}

void main().catch(e => { console.error(e); process.exit(1) })
