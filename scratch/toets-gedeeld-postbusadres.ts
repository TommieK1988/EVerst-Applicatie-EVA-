/**
 * Toets: kiest EVA de juiste persoon bij een gedeeld postbusadres?
 *
 *   npx tsx ../../scratch/toets-gedeeld-postbusadres.ts   (vanuit apps/dashboard)
 *
 * Leest alleen. Draait de echte `herkenAfzender` op het adres dat de fout liet
 * zien: denhaag@vve-nederland.nl hangt bij VvE Diensten Nederland Den Haag aan
 * meerdere contactpersonen. De eerste versie pakte de eerste rij uit de query en
 * zette daarmee "S. van Riel" op de beoordeling van dossier 20261.00282, terwijl
 * de brief van Arif Gasieta was.
 *
 * Drie gevallen:
 *   de mail noemt Gasieta  → Arif Gasieta, want die naam geeft uitsluitsel
 *   de mail noemt niemand  → wél de relatie, géén persoon
 *   de mail noemt iemand
 *   die er niet bij hoort  → ook geen persoon; niet gokken
 */
import fs from 'node:fs'
import path from 'node:path'

const env = fs.readFileSync(path.join(__dirname, '..', 'apps', 'dashboard', '.env.local'), 'utf-8')
for (const regel of env.split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(regel.trim())
  if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, '')
}

const ADRES = 'denhaag@vve-nederland.nl'

async function main() {
  const { herkenAfzender, normaliseerPersoon } = await import('@/lib/mailintake/afzender')
  const { kiesBetrokkene } = await import('@/lib/mailintake/betrokkenen-aanvullen')

  let fouten = 0
  const toets = (naam: string, gelukt: boolean, detail = '') => {
    if (!gelukt) fouten++
    console.log(`  ${gelukt ? 'ok   ' : 'FOUT '} ${naam}${gelukt ? '' : ` — ${detail}`}`)
  }

  console.log('\n── Namen vergelijkbaar maken ───────────────────────────────')
  toets('initialen tellen niet mee', normaliseerPersoon('A. Gasieta') === 'gasieta',
    normaliseerPersoon('A. Gasieta'))
  toets('titels tellen niet mee', normaliseerPersoon('dhr. Arif Gasieta') === 'arif gasieta',
    normaliseerPersoon('dhr. Arif Gasieta'))
  toets('tussenvoegsel blijft staan', normaliseerPersoon('S. van Riel') === 'van riel',
    normaliseerPersoon('S. van Riel'))

  console.log('\n── Het gedeelde postbusadres ───────────────────────────────')
  const metNaam = await herkenAfzender({
    vanAdres: ADRES, klantNaamUitMail: null, contactpersoonNaamUitMail: 'A. Gasieta',
  })
  console.log(`  met "A. Gasieta"  → ${metNaam.relatieNaam} · ${metNaam.contactpersoonNaam ?? '(geen persoon)'}`)
  console.log(`      ${metNaam.toelichting}`)
  toets('de relatie wordt herkend', metNaam.relatieId != null, metNaam.toelichting)
  toets('niet meer S. van Riel', !/riel/i.test(metNaam.contactpersoonNaam ?? ''),
    `koos ${metNaam.contactpersoonNaam}`)

  const zonderNaam = await herkenAfzender({ vanAdres: ADRES, klantNaamUitMail: null })
  console.log(`  zonder naam       → ${zonderNaam.relatieNaam} · ${zonderNaam.contactpersoonNaam ?? '(geen persoon)'}`)
  console.log(`      ${zonderNaam.toelichting}`)
  toets('zonder naam geen persoon', zonderNaam.contactpersoonId === null,
    `koos toch ${zonderNaam.contactpersoonNaam}`)
  toets('zonder naam wel de relatie', zonderNaam.relatieId != null)

  const vreemd = await herkenAfzender({
    vanAdres: ADRES, klantNaamUitMail: null, contactpersoonNaamUitMail: 'Pietje Puk',
  })
  toets('een onbekende naam levert geen gok op', vreemd.contactpersoonId === null,
    `koos ${vreemd.contactpersoonNaam}`)

  console.log('\n── Betrokkenen matchen ─────────────────────────────────────')
  const kandidaten = [
    { id: '1', voornaam: 'Sepp', tussenvoegsel: null, achternaam: 'Bollen', email: 's.bollen@vve-nederland.nl' },
    { id: '2', voornaam: 'Arif', tussenvoegsel: null, achternaam: 'Gasieta', email: 'a.gasieta@vve-nederland.nl' },
    { id: '3', voornaam: 'Peter', tussenvoegsel: null, achternaam: 'Pronk', email: 'p.pronk@vve-nederland.nl' },
  ]
  const geen = new Map<string, string[]>()

  const opEmail = kiesBetrokkene(
    { naam: 'S.J.R. Bollen', email: 's.bollen@vve-nederland.nl' }, kandidaten, geen)
  toets('e-mail wint', opEmail?.id === '1', `koos ${opEmail?.achternaam ?? 'niemand'}`)

  const opNaam = kiesBetrokkene({ naam: 'Sepp Bollen, technisch manager' }, kandidaten, geen)
  toets('achternaam werkt ook zonder e-mail', opNaam?.id === '1', `koos ${opNaam?.achternaam ?? 'niemand'}`)

  const onbekend = kiesBetrokkene({ naam: 'Rein van Lansberge' }, kandidaten, geen)
  toets('een bewoner wordt niet gematcht', onbekend === null,
    `koos ${onbekend?.achternaam ?? 'niemand'} — dat is een vreemde`)

  const dubbel = kiesBetrokkene({ naam: 'Bollen' }, [
    ...kandidaten,
    { id: '4', voornaam: 'Marit', tussenvoegsel: null, achternaam: 'Bollen', email: null },
  ], geen)
  toets('twee dezelfde achternamen is geen keuze', dubbel === null,
    `koos ${dubbel?.voornaam ?? 'niemand'}`)

  console.log(fouten === 0 ? '\nAlles goed\n' : `\n${fouten} fout(en)\n`)
  process.exit(fouten === 0 ? 0 : 1)
}

void main().catch(e => { console.error(e); process.exit(1) })
