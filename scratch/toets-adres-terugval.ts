/**
 * Toets: komt een adres met een foute postcode er nu doorheen?
 *
 *   npx tsx ../../scratch/toets-adres-terugval.ts   (vanuit apps/dashboard)
 *
 * Leest alleen, en doet geen enkele AI-aanroep: de modeluitvoer die er al ligt
 * gaat opnieuw door `keurEnKalibreer`. Dat is precies de poort die is gewijzigd,
 * dus dit meet de wijziging zonder de mail opnieuw te laten lezen.
 *
 * DE AANLEIDING
 * Kessler stuurt "Meerkoetlaan 73, 2623 NE Delft". Het adres bestaat, maar de
 * postcode is 2623 NG. `zoekAdres` klemt op postcode + huisnummer zodra beide er
 * zijn -- terecht, anders matcht een niet-bestaand huisnummer fuzzy naar de buren
 * -- en gaf daardoor nul treffers. Gevolg: alle vier de adresvelden op 0,60, onder
 * de 0,80 die `beslis` eist, en de bon bleef liggen op één verkeerde letter.
 *
 * Er wordt hier échte PDOK bevraagd; zonder netwerk zegt de toets niets.
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

async function main() {
  const { createAdminClient } = await import('@everts/database/server')
  const { keurEnKalibreer } = await import('@/lib/mailintake/extractie')
  const { VELD_BETROUWBAAR } = await import('@/lib/mailintake/types')
  const supabase = createAdminClient()

  let fouten = 0
  const toets = (naam: string, gelukt: boolean, detail = '') => {
    if (!gelukt) fouten++
    console.log(`  ${gelukt ? 'ok   ' : 'FOUT '} ${naam}${gelukt ? '' : ` — ${detail}`}`)
  }

  // De witte lijsten zoals `verwerken` ze samenstelt.
  const { getBouw7Categorieen } = await import('@/lib/bouw7/create-project')
  const categorieen = await getBouw7Categorieen()
  const { data: wms } = await supabase
    .from('bedrijfsgegevens').select('id, naam').eq('type', 'werkmaatschappij').limit(50)
  const lijsten = {
    categorieen: categorieen.map(c => ({ id: c.id, naam: c.name })),
    werkmaatschappijen: (wms ?? []).map(w => ({ id: w.id, naam: w.naam })),
  }

  // Berichten waarvan de laatste lezing een adres opleverde dat PDOK niet bevestigde.
  // Dat is de groep die deze wijziging moet raken; de rest hoort onveranderd te blijven.
  const { data: rijen } = await supabase
    .from('mailintake_extracties')
    .select('bericht_id, versie, velden, gekeurde_velden, mailintake_berichten(onderwerp, body_tekst)')
    .eq('ronde', 'velden')
    .not('gekeurde_velden', 'is', null)
    .order('versie', { ascending: false })
    .limit(200)

  const gezien = new Set<string>()
  const laatste = (rijen ?? []).filter(r => {
    if (gezien.has(r.bericht_id)) return false
    gezien.add(r.bericht_id)
    return true
  })

  console.log(`\n${laatste.length} berichten met een gekeurde lezing\n`)
  console.log('  onderwerp                                 PDOK   straat   was   wordt')

  let verbeterd = 0
  let verslechterd = 0

  for (const r of laatste) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const oud = r.gekeurde_velden as any
    if (!oud?.werkadresStraat) continue

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bericht = (r as any).mailintake_berichten
    const brontekst = [bericht?.onderwerp, bericht?.body_tekst].filter(Boolean).join('\n')

    const nieuw = await keurEnKalibreer(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      r.velden as any, lijsten, brontekst,
      { ontvangenOp: new Date().toISOString().slice(0, 10) },
    )

    const was = oud.vertrouwen?.werkadres_straat ?? 0
    const wordt = nieuw.vertrouwen?.werkadres_straat ?? 0
    const wasGoed = was >= VELD_BETROUWBAAR
    const wordtGoed = wordt >= VELD_BETROUWBAAR
    if (!wasGoed && wordtGoed) verbeterd++
    if (wasGoed && !wordtGoed) verslechterd++

    console.log(
      `  ${String(bericht?.onderwerp ?? '').slice(0, 40).padEnd(40)}`
      + `  ${nieuw.adresBevestigd ? 'ja ' : 'nee'}`
      + `  ${String(nieuw.werkadresStraat ?? '').slice(0, 14).padEnd(14)}`
      + `${was.toFixed(2).padStart(6)}${wordt.toFixed(2).padStart(8)}`
      + `${!wasGoed && wordtGoed ? '  ←' : ''}`,
    )
  }

  console.log(`\n  ${verbeterd} adres(sen) halen de drempel nu wél, ${verslechterd} niet meer\n`)

  // De aanleiding zelf, apart en met naam: het adres moet nu bevestigd zijn én de
  // postcode uit PDOK dragen, niet de foute uit de mail.
  console.log('── Meerkoetlaan 73 ─────────────────────────────────────────')
  const kessler = laatste.find(r =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    String((r as any).mailintake_berichten?.onderwerp ?? '').includes('Meerkoetlaan 73'))
  if (!kessler) {
    console.log('  bericht niet gevonden — toets zegt niets')
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b = (kessler as any).mailintake_berichten
    const res = await keurEnKalibreer(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      kessler.velden as any, lijsten, [b?.onderwerp, b?.body_tekst].filter(Boolean).join('\n'),
      { ontvangenOp: '2026-09-30' },
    )
    console.log(`  adres      : ${res.werkadresStraat} ${res.werkadresHuisnummer}, `
      + `${res.werkadresPostcode} ${res.werkadresStad}`)
    console.log(`  bevestigd  : ${res.adresBevestigd}`)
    console.log(`  vertrouwen : ${res.vertrouwen?.werkadres_straat}`)
    toets('PDOK bevestigt het adres ondanks de foute postcode', res.adresBevestigd)
    toets('de postcode is gecorrigeerd naar 2623 NG',
      (res.werkadresPostcode ?? '').replace(/\s/g, '') === '2623NG', String(res.werkadresPostcode))
    toets('het adres haalt de veldendrempel',
      (res.vertrouwen?.werkadres_straat ?? 0) >= VELD_BETROUWBAAR)
  }

  console.log(fouten === 0 ? '\nAlles goed\n' : `\n${fouten} fout(en)\n`)
  process.exit(fouten === 0 ? 0 : 1)
}

void main().catch(e => { console.error(e); process.exit(1) })
