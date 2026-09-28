/**
 * Toets: pakt EVA de contactpersoon die de mail zélf noemt?
 *
 *   npx tsx ../../scratch/toets-contactpersoon-uit-mail.ts   (vanuit apps/dashboard)
 *
 * Leest alleen; er wordt niets bijgewerkt en er gaat geen mail langs het model.
 * Neemt de berichten waarvan de lezing een contactpersoon-e-mailadres opleverde
 * en vergelijkt wie EVA koos met wie de mail noemt.
 *
 * WAT ER MIS WAS
 * De afzenderladder kiest de persoon op het adres waarvandaan de mail kwam. Bij
 * een postbus is dat de verkeerde vraag. Alle werkorders van KesslerPerspektief
 * komen van servicedesk@kesslerperspektief.nl, en dat adres hangt aan een
 * contactpersoon die ". Servicedesk" heet -- terwijl er in de tekst staat:
 *
 *     Contactpersoon: Angela Bindesar
 *     Email adres: a.bindesar@kesslerperspektief.nl
 *
 * Bij Schep Vastgoed (no_reply@) werd zelfs een willekeurige Helen Hollander
 * gekozen, en bij twee VvE-beheerders bleef het veld leeg terwijl de naam en het
 * adres gewoon in de mail stonden.
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
  const { verfijnContactpersoon } = await import('@/lib/mailintake/afzender')
  const supabase = createAdminClient()

  let fouten = 0
  const toets = (naam: string, gelukt: boolean, detail = '') => {
    if (!gelukt) fouten++
    console.log(`  ${gelukt ? 'ok   ' : 'FOUT '} ${naam}${gelukt ? '' : ` — ${detail}`}`)
  }

  const { data: rijen } = await supabase
    .from('mailintake_berichten')
    .select('id, onderwerp, van_adres, relatie_id, contactpersoon_id, relatie:relaties(naam)')
    .not('relatie_id', 'is', null)
    .order('ontvangen_op', { ascending: false })
    .limit(40)

  const berichten = rijen ?? []
  const ids = berichten.map(b => b.id)
  const { data: ex } = await supabase
    .from('mailintake_extracties')
    .select('bericht_id, velden, created_at')
    .in('bericht_id', ids)
    .eq('ronde', 'velden')
    .order('created_at', { ascending: false })
    .limit(200)

  const lezingPer = new Map<string, Record<string, unknown>>()
  for (const e of ex ?? []) {
    if (!lezingPer.has(e.bericht_id)) lezingPer.set(e.bericht_id, (e.velden ?? {}) as Record<string, unknown>)
  }

  const namenVan = new Map<string, string>()
  const { data: cps } = await supabase
    .from('contactpersonen')
    .select('id, voornaam, tussenvoegsel, achternaam')
    .in('id', berichten.map(b => b.contactpersoon_id).filter(Boolean) as string[])
    .limit(200)
  for (const c of cps ?? []) {
    namenVan.set(c.id, [c.voornaam, c.tussenvoegsel, c.achternaam].filter(Boolean).join(' ').trim())
  }

  console.log('\n── Wat de mail noemt vs. wie EVA koos ──────────────────────')
  let verbeterd = 0
  let ongemoeid = 0

  for (const b of berichten) {
    const v = lezingPer.get(b.id) ?? {}
    const mailNaam = (v.contactpersoon_naam as string | null) ?? null
    const mailMail = (v.contactpersoon_email as string | null) ?? null
    if (!mailNaam && !mailMail) continue

    const nu = b.contactpersoon_id ? (namenVan.get(b.contactpersoon_id) ?? '?') : '(leeg)'
    const res = await verfijnContactpersoon({
      relatieId: b.relatie_id,
      huidigeId: b.contactpersoon_id,
      emailUitMail: mailMail,
      naamUitMail: mailNaam,
    })

    if (!res) { ongemoeid++; continue }
    verbeterd++
    const klant = (b.relatie as unknown as { naam: string } | null)?.naam ?? '?'
    console.log(`\n  ${(b.onderwerp ?? '').slice(0, 62)}`)
    console.log(`    klant       ${klant}  ·  van ${b.van_adres}`)
    console.log(`    mail noemt  ${mailNaam ?? '-'} <${mailMail ?? '-'}>`)
    console.log(`    stond op    ${nu}`)
    console.log(`    wordt nu    ${res.naam}   ${res.hard ? '(op het adres)' : '(op de naam)'}`)
  }

  console.log(`\n  ${verbeterd} gecorrigeerd · ${ongemoeid} ongemoeid gelaten`)

  console.log('\n── De grenzen van de correctie ─────────────────────────────')
  // Een naam die bij deze klant niet bestaat, mag niets veranderen.
  const eenRelatie = berichten.find(b => b.relatie_id)?.relatie_id ?? null
  const verzonnen = await verfijnContactpersoon({
    relatieId: eenRelatie,
    huidigeId: null,
    emailUitMail: 'pietje.puk@nergens-bestaand.nl',
    naamUitMail: 'Pietje Puk',
  })
  toets('een onbekende naam verandert niets', verzonnen === null,
    `koos ${verzonnen?.naam}`)

  const zonderRelatie = await verfijnContactpersoon({
    relatieId: null, huidigeId: null,
    emailUitMail: 'a.bindesar@kesslerperspektief.nl', naamUitMail: 'Angela Bindesar',
  })
  toets('zonder klant wordt er niets gekozen', zonderRelatie === null)

  // ── De hele keten in één aanroep ─────────────────────────────────────────
  // De verwerking roept `herkenEnVerfijn` aan, niet de twee stappen apart. Dit is
  // de toets op wat er werkelijk draait.
  console.log('\n── herkenEnVerfijn op een echte werkorder ───────────────────')
  const { herkenEnVerfijn } = await import('@/lib/mailintake/afzender')
  const uit = await herkenEnVerfijn({
    vanAdres: 'servicedesk@kesslerperspektief.nl',
    klantNaamUitMail: 'KesslerPerspektief',
    contactpersoonNaamUitMail: 'Angela Bindesar',
    contactpersoonEmailUitMail: 'a.bindesar@kesslerperspektief.nl',
    eigenDomeinen: new Set(['everts.chat']),
  })
  console.log(`  klant    ${uit.relatieNaam ?? '-'}`)
  console.log(`  persoon  ${uit.contactpersoonNaam ?? '(geen)'}`)
  console.log(`  ${uit.toelichting}`)
  toets('de contactpersoon uit de mail wint van het postbusadres',
    (uit.contactpersoonNaam ?? '').includes('Bindesar'), `koos ${uit.contactpersoonNaam}`)

  console.log(fouten === 0 ? '\nAlles goed\n' : `\n${fouten} fout(en)\n`)
  process.exit(fouten === 0 ? 0 : 1)
}

void main().catch(e => { console.error(e); process.exit(1) })
