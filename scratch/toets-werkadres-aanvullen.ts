/**
 * Toets op het aanvullen van het werkadres.
 *
 *   npx tsx scratch/toets-werkadres-aanvullen.ts
 *
 * De regel die hier telt is niet "vult hij iets in" maar **wanneer hij afblijft**.
 * Een dossier dat al een werkadres heeft, heeft dat uit Bouw7 of van de calculator.
 * Een mail die een ander adres noemt is vaker een tweede locatie dan een correctie,
 * en stil verplaatsen betekent dat er een ploeg voor de verkeerde deur staat.
 *
 * De ene uitzondering verandert het adres niet maar de vorm: "Icarusweg 121" met
 * een leeg huisnummerveld mag uit elkaar, mits de mail hetzelfde adres noemt.
 */

import { splitsStraatEnNummer } from '../apps/dashboard/src/lib/mailintake/werkadres-aanvullen'

let fouten = 0
const toets = (naam: string, gelukt: boolean, detail = '') => {
  if (!gelukt) fouten++
  console.log(`  ${gelukt ? 'ok   ' : 'FOUT '} ${naam}${gelukt ? '' : ` — ${detail}`}`)
}

console.log('\n── Het geval uit de opdrachtbon van VvE Beheer ──────────────')
// Bouw7 had "Icarusweg 121" in het straatveld en niets in het huisnummer.
const a = splitsStraatEnNummer('Icarusweg 121', 'Icarusweg', '121')
toets('wordt gesplitst', a?.straat === 'Icarusweg' && a?.huisnummer === '121', JSON.stringify(a))

console.log('\n── Splitst alleen wat aantoonbaar hetzelfde is ──────────────')
toets('andere straat: afblijven',
  splitsStraatEnNummer('Artemisstraat 121', 'Icarusweg', '121') === null)
toets('ander nummer: afblijven',
  splitsStraatEnNummer('Icarusweg 121', 'Icarusweg', '123') === null)
toets('toevoeging achter het nummer: afblijven',
  splitsStraatEnNummer('Icarusweg 121 achter', 'Icarusweg', '121') === null)
toets('nummer staat er niet in: afblijven',
  splitsStraatEnNummer('Icarusweg', 'Icarusweg', '121') === null)
toets('leeg straatveld: afblijven',
  splitsStraatEnNummer('', 'Icarusweg', '121') === null)
toets('mail zonder nummer: afblijven',
  splitsStraatEnNummer('Icarusweg 121', 'Icarusweg', null) === null)

console.log('\n── Schrijfwijze mag verschillen, betekenis niet ─────────────')
toets('dubbele spatie in het veld',
  splitsStraatEnNummer('Icarusweg  121', 'Icarusweg', '121')?.huisnummer === '121')
toets('hoofdletters in de mail',
  splitsStraatEnNummer('icarusweg 121', 'Icarusweg', '121')?.straat === 'Icarusweg')
toets('nummer met toevoeging in beide',
  splitsStraatEnNummer('Icarusweg 121-B', 'Icarusweg', '121-B')?.huisnummer === '121-B')
// Een straat met een cijfer erin mag niet half opgegeten worden.
toets('straatnaam die op een cijfer eindigt',
  splitsStraatEnNummer('Plein 1940 12', 'Plein 1940', '12')?.straat === 'Plein 1940')

console.log(fouten === 0 ? '\nAlles goed\n' : `\n${fouten} fout(en)\n`)
process.exit(fouten === 0 ? 0 : 1)
