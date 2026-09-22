/**
 * Laat EVA een vastgelopen bericht opnieuw lezen.
 *
 *   npx tsx ../../scratch/lees-bericht-opnieuw.ts <bericht-id>   (vanuit apps/dashboard)
 *
 * Zet de status terug op `nieuw` met de pogingen op nul en draait `verwerkBericht`,
 * precies zoals de cron dat doet. Kost een AI-aanroep.
 */
import fs from 'node:fs'
import path from 'node:path'

const env = fs.readFileSync(path.join(__dirname, '..', 'apps', 'dashboard', '.env.local'), 'utf-8')
for (const regel of env.split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(regel.trim())
  if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, '')
}

// `React.cache` bestaat alleen in de server-build van React; lib/bouw7/snapshot.ts
// gebruikt het op moduleniveau. Buiten Next is doorgeven genoeg -- er is hier toch
// maar één aanroep per run, dus er valt niets te cachen.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const React = require('react')
if (typeof React.cache !== 'function') React.cache = (fn: unknown) => fn

async function main() {
  const id = process.argv[2]
  if (!id) throw new Error('Geef een bericht-id mee.')

  const { createAdminClient } = await import('@everts/database/server')
  const supabase = createAdminClient()

  const { data: voor } = await supabase.from('mailintake_berichten')
    .select('onderwerp, status, soort, pogingen, laatste_fout').eq('id', id).maybeSingle()
  console.log(`bericht : ${voor?.onderwerp}`)
  console.log(`vooraf  : ${voor?.status} / soort ${voor?.soort ?? '—'} / ${voor?.pogingen} pogingen`)

  await supabase.from('mailintake_berichten')
    .update({ status: 'nieuw', pogingen: 0, laatste_fout: null }).eq('id', id)

  const { verwerkBericht } = await import('../apps/dashboard/src/lib/mailintake/verwerken')
  const res = await verwerkBericht(id)
  console.log(`\nresultaat: ${res.status} — ${res.reden}`)
  if (res.fout) console.log(`fout     : ${res.fout}`)
  console.log(`kosten   : ${res.kostenCent} cent`)

  const { data: na } = await supabase.from('mailintake_berichten')
    .select('status, soort, soort_vertrouwen, samenvatting, dossier_id, relatie_id').eq('id', id).maybeSingle()
  console.log(`\nsoort    : ${na?.soort} (${Math.round(Number(na?.soort_vertrouwen ?? 0) * 100)}%)`)
  console.log(`status   : ${na?.status}`)
  console.log(`samenvat.: ${na?.samenvatting ?? '—'}`)

  const { data: ex } = await supabase.from('mailintake_extracties')
    .select('gekeurde_velden').eq('bericht_id', id).eq('ronde', 'velden')
    .not('gekeurde_velden', 'is', null).order('created_at', { ascending: false }).limit(1).maybeSingle()
  const v = (ex?.gekeurde_velden ?? {}) as Record<string, unknown>
  console.log('\nwerkadres:')
  for (const k of ['werkadresStraat', 'werkadresHuisnummer', 'werkadresPostcode', 'werkadresStad',
                   'werkadresNaam', 'werkadresTelefoon', 'werkadresEmail']) {
    console.log(`  ${k.padEnd(20)} ${(v[k] as string) ?? '—'}`)
  }
  console.log(`\nreferentie: ${(v.referentie as string) ?? '—'}`)
  console.log(`omschrijving: ${String(v.omschrijving ?? '—').slice(0, 160)}`)
}

void main().catch(e => { console.error(e); process.exit(1) })
