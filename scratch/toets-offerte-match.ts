/**
 * Toets: vindt een opdracht het dossier van onze eigen offerte?
 *
 *   npx tsx ../../scratch/toets-offerte-match.ts   (vanuit apps/dashboard)
 *
 * Leest alleen, geen AI-aanroep: de opgeslagen modeluitvoer gaat opnieuw door
 * `zoekDuplicaten`. Dat is de functie die is gewijzigd.
 *
 * DE AANLEIDING
 * Van Herk stuurde inkooporder ION112400001209 met ónze offerte OFT-2026-171.pdf
 * als bijlage erbij. Het model las dat nummer met vertrouwen 1,0. Toch meldde EVA
 * "er is geen offerte gevonden die hierbij hoort". Twee oorzaken:
 *
 *  1. `zoekDuplicaten` zocht ons nummer in `dossiers.referentie` en
 *     `dossiers.dossiernummer`. Ons offertenummer leeft in `quotes.quote_nummer`,
 *     een heel andere reeks: OFT-2026-171 hoort bij dossier 20267.00682.
 *  2. Alleen een dossier op hoofdstatus 'offerte' werd een `offerte_match`.
 *     20267.00682 stond op 'aanvraag' terwijl de offerte allang verzonden was.
 *
 * Het dossier wérd gevonden -- via straat en klantreferentie, score 0,55 -- maar
 * als gewone duplicaat. Daardoor bood het scherm de verkeerde knop aan.
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

const BERICHT = 'ef8d2dce-746e-40f2-b441-21afdbcc2561'

async function main() {
  const { createAdminClient } = await import('@everts/database/server')
  const { zoekDuplicaten } = await import('@/lib/mailintake/duplicaten')
  const supabase = createAdminClient()

  let fouten = 0
  const toets = (naam: string, gelukt: boolean, detail = '') => {
    if (!gelukt) fouten++
    console.log(`  ${gelukt ? 'ok   ' : 'FOUT '} ${naam}${gelukt ? '' : ` — ${detail}`}`)
  }

  const { data: b } = await supabase
    .from('mailintake_berichten')
    .select('id, onderwerp, body_tekst, conversation_id, relatie_id')
    .eq('id', BERICHT).maybeSingle()
  const { data: e } = await supabase
    .from('mailintake_extracties')
    .select('velden, gekeurde_velden')
    .eq('bericht_id', BERICHT).eq('ronde', 'velden')
    .order('versie', { ascending: false }).limit(1).maybeSingle()

  if (!b || !e) { console.log('bericht of extractie niet gevonden'); process.exit(1) }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = e.gekeurde_velden as any
  const { data: bl } = await supabase
    .from('mailintake_bijlagen').select('sha256').eq('bericht_id', BERICHT).limit(20)

  console.log(`\n${b.onderwerp}\n`)
  console.log(`  ons offertenummer uit de mail : ${g.onzeReferentie}`)
  console.log(`  referentie van de klant       : ${g.referentie}`)
  console.log(`  inkoopordernummer             : ${g.opdrachtReferentie}`)
  console.log(`  factuuradres                  : ${JSON.stringify(g.factuuradres)}\n`)

  const kandidaten = await zoekDuplicaten({
    berichtId: BERICHT,
    relatieId: b.relatie_id,
    onderwerp: b.onderwerp,
    bodyTekst: b.body_tekst,
    conversationId: b.conversation_id,
    bijlageHashes: (bl ?? []).map(x => x.sha256).filter(Boolean) as string[],
    postcode: g.werkadresPostcode,
    huisnummer: g.werkadresHuisnummer,
    referentie: g.referentie,
    onzeReferentie: g.onzeReferentie,
    omschrijving: g.omschrijving,
    bedrag: g.bedragExclBtw,
  })

  console.log('  score  soort              dossier       redenen')
  for (const k of kandidaten) {
    console.log(`  ${k.score.toFixed(2)}   ${k.soort.padEnd(18)} ${String(k.dossiernummer ?? '').padEnd(13)} `
      + `${k.redenen.join(' · ')}`)
  }
  console.log('')

  // De keuring opnieuw draaien: `gekeurde_velden` hierboven is de oude uitkomst,
  // van vóór de wijziging. Het factuuradres stond daar op null omdat de opdracht
  // alleen een tenaamstelling noemt en geen straat.
  console.log('── De keuring opnieuw ──────────────────────────────────────')
  const { keurEnKalibreer } = await import('@/lib/mailintake/extractie')
  const { getBouw7Categorieen } = await import('@/lib/bouw7/create-project')
  const { data: wms } = await supabase
    .from('bedrijfsgegevens').select('id, naam').eq('type', 'werkmaatschappij').limit(50)
  const vers = await keurEnKalibreer(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    e.velden as any,
    {
      categorieen: (await getBouw7Categorieen()).map(c => ({ id: c.id, naam: c.name })),
      werkmaatschappijen: (wms ?? []).map(w => ({ id: w.id, naam: w.naam })),
    },
    [b.onderwerp, b.body_tekst].filter(Boolean).join('\n'),
    { ontvangenOp: '2026-09-30', bijlagenGelezen: 2 },
  )
  console.log(`  factuuradres          : ${JSON.stringify(vers.factuuradres)}`)
  console.log(`  opdracht_referentie   : ${vers.opdrachtReferentie}`)
  toets('de tenaamstelling van de factuur blijft staan',
    vers.factuuradres?.naam === 'Nationaal Grondbezit Romeo Foxtrot B.V.',
    JSON.stringify(vers.factuuradres))
  toets('het inkoopordernummer blijft staan',
    vers.opdrachtReferentie === 'ION112400001209', String(vers.opdrachtReferentie))
  console.log('')

  const juiste = kandidaten.find(k => k.dossiernummer === '20267.00682')
  toets('het dossier van OFT-2026-171 zit erbij', Boolean(juiste))
  toets('het is een offerte_match, geen gewone duplicaat',
    juiste?.soort === 'offerte_match', String(juiste?.soort))
  toets('het offertenummer telt als reden',
    Boolean(juiste?.redenen.some(r => r.includes('OFT-2026-171'))),
    juiste?.redenen.join(' · ') ?? '')
  toets('de score is hoog genoeg voor een harde treffer (>= 0,80)',
    (juiste?.score ?? 0) >= 0.8, String(juiste?.score))

  console.log(fouten === 0 ? '\nAlles goed\n' : `\n${fouten} fout(en)\n`)
  process.exit(fouten === 0 ? 0 : 1)
}

void main().catch(e => { console.error(e); process.exit(1) })
