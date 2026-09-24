/**
 * Toets: haalt EVA de oorspronkelijke afzender uit een doorgestuurde mail?
 *
 *   npx tsx ../../scratch/toets-doorstuur-afzender.ts   (vanuit apps/dashboard)
 *
 * Draait zonder netwerk. Neemt de échte body van het bericht dat de fout liet
 * zien (FW: Offerte dak reparatie, Burgemeester Meineszlaan 62) plus een reeks
 * vormen waarin Outlook een doorstuurkop schrijft.
 *
 * WAAROM DIT ERTOE DOET
 * Vindt `afzenderUitDoorstuur` de oorspronkelijke afzender niet, dan valt EVA
 * terug op het adres van de collega die doorstuurde -- en dat is óns domein. De
 * afzenderladder zoekt dan verder op `@everts.chat`, vindt daar precies één
 * relatie aan hangen (FASA, via een eigen medewerker die daar als contactpersoon
 * staat) en stelt die voor als opdrachtgever. Zo werd een particulier met een
 * gmail-adres ingeschreven als FASA.
 */
import fs from 'node:fs'
import path from 'node:path'

const env = fs.readFileSync(path.join(__dirname, '..', 'apps', 'dashboard', '.env.local'), 'utf-8')
for (const regel of env.split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(regel.trim())
  if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, '')
}

const EIGEN = new Set(['everts.chat'])

/** Zoals Outlook het schrijft, in de vormen die we in de postbus tegenkomen. */
const GEVALLEN: { naam: string; body: string; verwacht: string | null }[] = [
  {
    naam: 'spaties binnen de punthaken (Outlook-web)',
    body: 'Van: Marco Dubbeldam < marcodubbeldam@gmail.com >\nVerzonden: donderdag 24 september 2026 11:09',
    verwacht: 'marcodubbeldam@gmail.com',
  },
  {
    naam: 'zonder spaties',
    body: 'Van: Marco Dubbeldam <marcodubbeldam@gmail.com>',
    verwacht: 'marcodubbeldam@gmail.com',
  },
  {
    naam: 'Engelstalige client',
    body: 'From: Marco Dubbeldam <marcodubbeldam@gmail.com>',
    verwacht: 'marcodubbeldam@gmail.com',
  },
  {
    naam: 'kaal adres zonder naam',
    body: 'Van: marcodubbeldam@gmail.com',
    verwacht: 'marcodubbeldam@gmail.com',
  },
  {
    naam: 'eigen collega wordt overgeslagen, de klant erna gepakt',
    body: 'Van: Bas Hania <bas@everts.chat>\nVan: Klant <klant@vvebeheer.nl>',
    verwacht: 'klant@vvebeheer.nl',
  },
  {
    naam: 'alleen onze eigen mensen: niets te halen',
    body: 'Van: Bas Hania <bas@everts.chat>',
    verwacht: null,
  },
  {
    naam: 'handtekening met e-mail maar geen Van-regel',
    body: 'Met vriendelijke groet,\nMarco Veltman\nE marco@everts.chat',
    verwacht: null,
  },
]

async function main() {
  const { afzenderUitDoorstuur } = await import('@/lib/mailintake/triage')
  const { createAdminClient } = await import('@everts/database/server')

  let fouten = 0
  const toets = (naam: string, gelukt: boolean, detail = '') => {
    if (!gelukt) fouten++
    console.log(`  ${gelukt ? 'ok   ' : 'FOUT '} ${naam}${gelukt ? '' : ` — ${detail}`}`)
  }

  console.log('\n── Vormen van een doorstuurkop ─────────────────────────────')
  for (const g of GEVALLEN) {
    const uit = afzenderUitDoorstuur(g.body, EIGEN)
    toets(g.naam, uit === g.verwacht, `kreeg ${uit ?? 'null'}, verwacht ${g.verwacht ?? 'null'}`)
  }

  console.log('\n── De echte mail die de fout liet zien ─────────────────────')
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('mailintake_berichten')
    .select('onderwerp, van_adres, body_tekst')
    .eq('id', '7012f694-0707-4280-ac27-8978bd4b03a9')
    .maybeSingle()

  if (!data) {
    console.log('  (bericht niet gevonden — overgeslagen)')
  } else {
    const uit = afzenderUitDoorstuur(data.body_tekst ?? '', EIGEN)
    console.log(`  ${data.onderwerp}`)
    console.log(`  doorgestuurd door : ${data.van_adres}`)
    console.log(`  oorspronkelijk    : ${uit ?? '(niet gevonden)'}`)
    toets('de oorspronkelijke afzender wordt gevonden',
      uit === 'marcodubbeldam@gmail.com', `kreeg ${uit ?? 'null'}`)
  }

  // ── De eigen domeinen, zoals de verwerking ze opbouwt ───────────
  // Hier zat de werkelijke oorzaak: het medewerkersbestand bevat prívé-adressen,
  // dus gmail.com gold als "ons domein".
  console.log('\n── Wat telt als ons eigen domein ───────────────────')
  const { domeinVan, isVrijMaildomein } = await import('@/lib/mailintake/triage')
  const { data: mw } = await supabase
    .from('medewerkers').select('email').eq('actief', true).not('email', 'is', null).limit(500)

  const ruw = new Set<string>()
  const gefilterd = new Set<string>()
  for (const m of mw ?? []) {
    const d = domeinVan(m.email)
    if (!d) continue
    ruw.add(d)
    if (!isVrijMaildomein(d)) gefilterd.add(d)
  }
  console.log(`  zonder filter : ${[...ruw].join(', ')}`)
  console.log(`  met filter    : ${[...gefilterd].join(', ')}`)
  toets('gmail.com telt niet als ons domein', !gefilterd.has('gmail.com'))
  toets('everts.chat telt wél als ons domein', gefilterd.has('everts.chat'))

  console.log('\n── De aanvraag Burgemeester Meineszlaan 62 ───────────')
  if (data) {
    const { herkenAfzender } = await import('@/lib/mailintake/afzender')
    const echt = afzenderUitDoorstuur(data.body_tekst ?? '', gefilterd) ?? data.van_adres
    const afz = await herkenAfzender({
      vanAdres: echt,
      klantNaamUitMail: 'Marco Dubbeldam',
      doorgestuurd: false,
      eigenDomeinen: gefilterd,
    })
    console.log(`  afzender   : ${echt}`)
    console.log(`  herkend als: ${afz.relatieNaam ?? '(niet herkend)'} · score ${afz.score} · via ${afz.via ?? '-'}`)
    console.log(`  ${afz.toelichting}`)
    toets('de klant is niet meer FASA', afz.relatieNaam !== 'FASA', `koos ${afz.relatieNaam}`)
    toets('een onbekende particulier wordt niet herkend', afz.relatieId === null,
      `koos toch ${afz.relatieNaam}`)
  }

  console.log(fouten === 0 ? '\nAlles goed\n' : `\n${fouten} fout(en)\n`)
  process.exit(fouten === 0 ? 0 : 1)
}

void main().catch(e => { console.error(e); process.exit(1) })
