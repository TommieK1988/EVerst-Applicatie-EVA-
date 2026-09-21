/**
 * Toets op de werkmaatschappij-regel.
 *
 * Draaien: npx tsx scratch/toets-werkmaatschappij.ts
 *
 * regels.ts is bewust vrij van server-only en van netwerk, juist zodat deze regel
 * zonder omwegen te toetsen is.
 *
 * De regel is in twee lagen opgebouwd, en die volgorde is het hele punt: vier van
 * de zes categorieën beslissen op zichzelf al, en alleen Bouwkundig Onderhoud is
 * een echt twijfelgeval. Wat daar gemengd of onduidelijk blijkt, krijgt géén
 * werkmaatschappij en gaat naar een mens.
 */

import { kiesWerkmaatschappij } from '../apps/dashboard/src/lib/mailintake/regels'

function main() {
  // De werkmaatschappijen zoals ze in productie staan, plus Schildersbedrijf Everts:
  // die en Dakplan doen bij een intake niet mee en mogen nooit gekozen worden.
  const lijst = [
    { id: 'bbm', naam: 'Bouwbedrijf Morgenstond B.V.' },
    { id: 'dakplan', naam: 'Dakdekkersbedrijf Dakplan B.V.' },
    { id: 'eos', naam: 'Everts Onderhoudsschilders B.V.' },
    { id: 'sbe', naam: 'Schildersbedrijf Everts B.V.' },
  ]

  let fouten = 0
  const toets = (naam: string, gelukt: boolean, detail = '') => {
    if (!gelukt) fouten++
    console.log(`  ${gelukt ? 'ok   ' : 'FOUT '} ${naam}${gelukt ? '' : ` -- ${detail}`}`)
  }

  console.log('\n-- De categorie beslist, ongeacht de aard -------------------')
  // Morgenstond dekt bij deze drie altijd de lading, ook als er schilderwerk in zit.
  for (const cat of ['Renovatie', 'Mutatie', 'Dagelijks onderhoud']) {
    const uit = kiesWerkmaatschappij(null, cat, lijst)
    toets(`${cat} -> Morgenstond`, uit.id === 'bbm' && uit.via === 'categorie', JSON.stringify(uit))
    // Zelfs als het model "gemengd" of "schilderwerk" zegt, blijft de categorie leidend.
    for (const aard of ['gemengd', 'onduidelijk', 'schilderwerk'] as const) {
      toets(`${cat} blijft Morgenstond bij aard=${aard}`,
        kiesWerkmaatschappij(aard, cat, lijst).id === 'bbm')
    }
  }

  const schild = kiesWerkmaatschappij(null, 'Schilderwerk', lijst)
  toets('Schilderwerk -> Everts Onderhoudsschilders',
    schild.id === 'eos' && schild.via === 'categorie', JSON.stringify(schild))
  toets('Schilderwerk blijft Everts bij aard=gemengd',
    kiesWerkmaatschappij('gemengd', 'Schilderwerk', lijst).id === 'eos')

  console.log('\n-- Bouwkundig Onderhoud is het twijfelgeval -----------------')
  const bo = (aard: 'schilderwerk' | 'bouwkundig' | 'gemengd' | 'onduidelijk' | null) =>
    kiesWerkmaatschappij(aard, 'Bouwkundig Onderhoud', lijst)

  toets('overwegend schilderwerk -> Everts Onderhoudsschilders',
    bo('schilderwerk').id === 'eos' && bo('schilderwerk').via === 'aard')
  toets('bouwkundig -> Morgenstond',
    bo('bouwkundig').id === 'bbm' && bo('bouwkundig').via === 'aard')
  toets('gemengd -> leeg laten en voorleggen',
    bo('gemengd').id === null && bo('gemengd').via === 'voorleggen')
  toets('onduidelijk -> leeg laten en voorleggen',
    bo('onduidelijk').id === null && bo('onduidelijk').via === 'voorleggen')
  toets('geen oordeel over de aard -> ook leeg',
    bo(null).id === null && bo(null).via === 'geen', JSON.stringify(bo(null)))

  console.log('\n-- Overige en geen categorie: de aard beslist ---------------')
  toets('Overige met bouwkundig -> Morgenstond',
    kiesWerkmaatschappij('bouwkundig', 'Overige', lijst).id === 'bbm')
  toets('Overige met gemengd -> voorleggen',
    kiesWerkmaatschappij('gemengd', 'Overige', lijst).id === null)
  toets('geen categorie met schilderwerk -> Everts',
    kiesWerkmaatschappij('schilderwerk', null, lijst).id === 'eos')
  const niets = kiesWerkmaatschappij(null, null, lijst)
  toets('niets bekend -> leeg', niets.id === null && niets.via === 'geen', JSON.stringify(niets))

  console.log('\n-- Dakplan en Schildersbedrijf Everts nooit ------------------')
  const alle = [
    ...['Renovatie', 'Mutatie', 'Dagelijks onderhoud', 'Schilderwerk', 'Bouwkundig Onderhoud', 'Overige']
      .flatMap(c => [null, 'schilderwerk', 'bouwkundig', 'gemengd', 'onduidelijk'] as const)
      .map((a, i) => kiesWerkmaatschappij(a, ['Renovatie', 'Mutatie', 'Dagelijks onderhoud',
        'Schilderwerk', 'Bouwkundig Onderhoud', 'Overige'][Math.floor(i / 5)] ?? null, lijst)),
    kiesWerkmaatschappij(null, null, lijst),
  ]
  toets('geen enkele route levert Dakplan op', !alle.some(u => u.id === 'dakplan'))
  toets('geen enkele route levert Schildersbedrijf Everts op', !alle.some(u => u.id === 'sbe'))

  console.log('\n-- Ontbrekende werkmaatschappij levert geen verkeerde ---------')
  toets('Schilderwerk zonder schildersbedrijf in de lijst blijft leeg',
    kiesWerkmaatschappij(null, 'Schilderwerk',
      [{ id: 'bbm', naam: 'Bouwbedrijf Morgenstond B.V.' }]).id === null)

  console.log(fouten === 0 ? '\nAlles goed\n' : `\n${fouten} fout(en)\n`)
  process.exit(fouten === 0 ? 0 : 1)
}

main()
