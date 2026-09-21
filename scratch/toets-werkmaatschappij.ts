/**
 * Toets op de werkmaatschappij-regel uit de intakebeschrijving.
 *
 * Draaien: npx tsx scratch/toets-werkmaatschappij.ts
 *
 * regels.ts is bewust vrij van server-only en van netwerk, juist zodat deze regel
 * zonder omwegen te toetsen is.
 *
 * De regel kent vier gevallen, en het vierde is het belangrijkste: gemengd of
 * onduidelijk werk krijgt géén werkmaatschappij en gaat naar een mens. Daar zat
 * eerder een stille terugval op de standaard van de postbus, en dat is precies het
 * gokken dat bij een intake niet hoort.
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

  console.log('\n-- De vier gevallen -----------------------------------------')
  const schilder = kiesWerkmaatschappij('schilderwerk', null, lijst)
  toets('zuiver of overwegend schilderwerk -> Everts Onderhoudsschilders',
    schilder.id === 'eos' && schilder.via === 'aard', JSON.stringify(schilder))

  // "Hoofdzakelijk bouwkundig met een klein deel schilderwerk" valt voor het model
  // onder bouwkundig; de beschrijving zet die twee bewust op dezelfde uitkomst.
  const bouw = kiesWerkmaatschappij('bouwkundig', null, lijst)
  toets('bouwkundig werk -> Bouwbedrijf Morgenstond',
    bouw.id === 'bbm' && bouw.via === 'aard', JSON.stringify(bouw))

  const gemengd = kiesWerkmaatschappij('gemengd', null, lijst)
  toets('gemengd -> leeg laten en voorleggen',
    gemengd.id === null && gemengd.via === 'voorleggen', JSON.stringify(gemengd))

  const onduidelijk = kiesWerkmaatschappij('onduidelijk', null, lijst)
  toets('onduidelijk -> leeg laten en voorleggen',
    onduidelijk.id === null && onduidelijk.via === 'voorleggen', JSON.stringify(onduidelijk))

  console.log('\n-- Het oordeel gaat voor op de categorie ---------------------')
  // Anders zou een gemengde klus met categorie Schilderwerk alsnog stilzwijgend bij
  // de schilders belanden -- precies wat voorgelegd had moeten worden.
  toets('gemengd met categorie Schilderwerk blijft leeg',
    kiesWerkmaatschappij('gemengd', 'Schilderwerk', lijst).id === null)

  console.log('\n-- Zonder oordeel valt de categorie terug --------------------')
  const catS = kiesWerkmaatschappij(null, 'Schilderwerk', lijst)
  toets('Schilderwerk -> Everts Onderhoudsschilders',
    catS.id === 'eos' && catS.via === 'categorie', JSON.stringify(catS))
  for (const cat of ['Bouwkundig Onderhoud', 'Dagelijks onderhoud', 'Mutatie', 'Renovatie', 'Overige']) {
    toets(`${cat} -> Morgenstond`, kiesWerkmaatschappij(null, cat, lijst).id === 'bbm')
  }

  console.log('\n-- Dakplan en Schildersbedrijf Everts nooit ------------------')
  const alle = [
    kiesWerkmaatschappij('schilderwerk', null, lijst),
    kiesWerkmaatschappij('bouwkundig', null, lijst),
    kiesWerkmaatschappij('gemengd', null, lijst),
    kiesWerkmaatschappij('onduidelijk', null, lijst),
    kiesWerkmaatschappij(null, 'Schilderwerk', lijst),
    kiesWerkmaatschappij(null, 'Renovatie', lijst),
    kiesWerkmaatschappij(null, 'Overige', lijst),
  ]
  toets('geen enkele route levert Dakplan op', !alle.some(u => u.id === 'dakplan'))
  toets('geen enkele route levert Schildersbedrijf Everts op', !alle.some(u => u.id === 'sbe'))

  console.log('\n-- Niets bekend ---------------------------------------------')
  const niets = kiesWerkmaatschappij(null, null, lijst)
  toets('zonder aard en zonder categorie blijft het leeg',
    niets.id === null && niets.via === 'geen', JSON.stringify(niets))
  toets('schilderwerk zonder schildersbedrijf in de lijst blijft leeg',
    kiesWerkmaatschappij('schilderwerk', null, [{ id: 'bbm', naam: 'Bouwbedrijf Morgenstond B.V.' }]).id === null)

  console.log(fouten === 0 ? '\nAlles goed\n' : `\n${fouten} fout(en)\n`)
  process.exit(fouten === 0 ? 0 : 1)
}

main()
