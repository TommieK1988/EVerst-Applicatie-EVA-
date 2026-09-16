/**
 * Toets op de werkmaatschappij-regel.
 *
 * Draaien: npx tsx scratch/toets-werkmaatschappij.ts
 *
 * regels.ts is bewust vrij van server-only en van netwerk, juist zodat deze regel
 * zonder omwegen te toetsen is.
 */

import { kiesWerkmaatschappij } from '../apps/dashboard/src/lib/mailintake/regels'

function main() {
  // De werkmaatschappijen zoals ze in productie staan.
  const lijst = [
    { id: 'bbm', naam: 'Bouwbedrijf Morgenstond B.V.' },
    { id: 'dakplan', naam: 'Dakdekkersbedrijf Dakplan B.V.' },
    { id: 'eos', naam: 'Everts Onderhoudsschilders B.V.' },
  ]

  let fouten = 0
  const toets = (naam: string, uit: { id: string | null; via: string }, verwachtId: string | null, verwachtVia: string) => {
    const goed = uit.id === verwachtId && uit.via === verwachtVia
    if (!goed) fouten++
    console.log(`  ${goed ? 'ok   ' : 'FOUT '} ${naam} → ${uit.id}/${uit.via}` +
      (goed ? '' : ` (verwacht ${verwachtId}/${verwachtVia})`))
  }

  console.log('\n── Categorieregel ───────────────────────────────────────────')
  toets('Schilderwerk', kiesWerkmaatschappij(null, 'Schilderwerk', lijst, null), 'eos', 'categorie')
  toets('Bouwkundig Onderhoud', kiesWerkmaatschappij(null, 'Bouwkundig Onderhoud', lijst, null), 'bbm', 'categorie')
  toets('Dagelijks onderhoud', kiesWerkmaatschappij(null, 'Dagelijks onderhoud', lijst, null), 'bbm', 'categorie')
  toets('Mutatie', kiesWerkmaatschappij(null, 'Mutatie', lijst, null), 'bbm', 'categorie')
  toets('Renovatie', kiesWerkmaatschappij(null, 'Renovatie', lijst, null), 'bbm', 'categorie')
  toets('Overige', kiesWerkmaatschappij(null, 'Overige', lijst, null), 'bbm', 'categorie')

  console.log('\n── De mail wint van de categorieregel ───────────────────────')
  // Zonder deze voorrang zou Dakplan nooit meer gekozen kunnen worden.
  toets('mail noemt Dakplan bij een dakklus',
    kiesWerkmaatschappij('Dakdekkersbedrijf Dakplan B.V.', 'Bouwkundig Onderhoud', lijst, null),
    'dakplan', 'mail')
  toets('mail noemt Dakplan half',
    kiesWerkmaatschappij('Dakplan', 'Schilderwerk', lijst, null), 'dakplan', 'mail')
  toets('onbekende naam in de mail valt terug op de categorie',
    kiesWerkmaatschappij('Everts Dakwerken', 'Schilderwerk', lijst, null), 'eos', 'categorie')

  console.log('\n── Terugval ─────────────────────────────────────────────────')
  toets('geen categorie → postbusstandaard',
    kiesWerkmaatschappij(null, null, lijst, 'bbm'), 'bbm', 'standaard')
  toets('niets bekend → niets',
    kiesWerkmaatschappij(null, null, lijst, null), null, 'geen')

  console.log(fouten === 0 ? '\nAlles goed\n' : `\n${fouten} fout(en)\n`)
  process.exit(fouten === 0 ? 0 : 1)
}

main()
