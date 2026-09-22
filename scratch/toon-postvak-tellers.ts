/**
 * Legt de tellers naast de lijst die het tabblad werkelijk toont.
 *
 *   npx tsx ../../scratch/toon-postvak-tellers.ts   (vanuit apps/dashboard)
 *
 * Dat is de hele toets: een teller die iets anders belooft dan wat je ziet, laat je
 * zoeken naar post die er niet is. Alleen lezen.
 */
import fs from 'node:fs'
import path from 'node:path'

const env = fs.readFileSync(path.join(__dirname, '..', 'apps', 'dashboard', '.env.local'), 'utf-8')
for (const regel of env.split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(regel.trim())
  if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, '')
}

async function main() {
  const { getPostvakRijen, getPostvakTellers } =
    await import('../apps/dashboard/src/lib/mailintake/data')

  const tellers = await getPostvakTellers()
  const tabs = [
    ['te_behandelen', 'wacht_op_mens'],
    ['geen_aanvraag', 'geen_aanvraag'],
    ['genegeerd', 'genegeerd'],
    ['mislukt', 'mislukt'],
  ] as const

  let fouten = 0
  for (const [tab, sleutel] of tabs) {
    const rijen = await getPostvakRijen(tab)
    const teller = tellers[sleutel]
    const klopt = teller.aantal === rijen.length || teller.meer
    if (!klopt) fouten++
    console.log(
      `  ${klopt ? 'ok   ' : 'FOUT '} ${tab.padEnd(16)} teller ${String(teller.aantal).padStart(3)}` +
      `${teller.meer ? '+' : ' '}   lijst ${String(rijen.length).padStart(3)} regels` +
      `   (${rijen.reduce((n, r) => n + r.aantalInGroep, 0)} mails)`,
    )
  }
  // Tabbladen zonder teller, puur om te laten zien dat het samenvouwen werkt: waar
  // meer mails over dezelfde klus gaan, is "regels" lager dan "mails". Precies dat
  // verschil zette de oude teller ernaast.
  const { createAdminClient } = await import('@everts/database/server')
  const supabase = createAdminClient()
  for (const tab of ['verwerkt', 'alles'] as const) {
    const rijen = await getPostvakRijen(tab)
    const mails = rijen.reduce((n, r) => n + r.aantalInGroep, 0)
    console.log(
      `        ${tab.padEnd(16)} ${String(rijen.length).padStart(3)} regels uit ` +
      `${String(mails).padStart(3)} mails${mails > rijen.length ? '  <- hier scheelde het' : ''}`,
    )
  }
  const { count: totaal } = await supabase
    .from('mailintake_berichten').select('id', { count: 'exact', head: true })
  console.log(`\n  berichten in totaal: ${totaal}`)
  console.log(`  wachtrij (nieuw/bezig): ${tellers.wachtrij.aantal}`)
  console.log(fouten === 0 ? '\nTeller en lijst zeggen hetzelfde\n' : `\n${fouten} verschil(len)\n`)
  process.exit(fouten === 0 ? 0 : 1)
}

void main().catch(e => { console.error(e); process.exit(1) })
