/**
 * Toets op de regie-herkenning, met de zinnen zoals ze werkelijk binnenkwamen.
 *
 * Draaien: npx tsx scratch/toets-regie-herkenning.ts
 *
 * De aanleiding staat in geval 1: een opdrachtbon die glashelder zegt dat er op
 * uurbasis gewerkt wordt, zonder één woord uit welke lijst dan ook. Alleen op een
 * woordenlijst controleren betekent dat je elke schrijfwijze vooraf moet raden.
 */

import { komtVoorInBron, noemtRegie } from '../apps/dashboard/src/lib/mailintake/regels'

let fouten = 0
const toets = (naam: string, gelukt: boolean, detail = '') => {
  if (!gelukt) fouten++
  console.log(`  ${gelukt ? 'ok   ' : 'FOUT '} ${naam}${gelukt ? '' : ` — ${detail}`}`)
}

/** De regel zoals extractie.ts hem toepast. */
const regieUit = (modelZegt: boolean, aanwijzing: string | null, bron: string) =>
  modelZegt && (komtVoorInBron(aanwijzing, bron) || noemtRegie(bron))

// De echte bon van Schep Vastgoed Managers, 16 september.
const BON = `hierbij ontvangen jullie de opdrachtbon voor het ondersteunen bij de firma
proline voor de werkzaamheden gelegen bij woning 32, 34 & 36.
dit is op basis van uur werk en zal geen mandaat afgegeven worden.
dit besproken via de mail met Marco Veltman.`

console.log('\n── De bon die het misgaan liet zien ─────────────────────────')
toets('geen enkel regiewoord in deze bon', noemtRegie(BON) === false)
toets('de aangehaalde zin wordt wél teruggevonden',
  komtVoorInBron('"dit is op basis van uur werk en zal geen mandaat afgegeven worden."', BON))
toets('en dus wordt het regie',
  regieUit(true, '"dit is op basis van uur werk en zal geen mandaat afgegeven worden."', BON) === true)

console.log('\n── Leestekens en regeleindes ────────────────────────────────')
toets('aanhalingstekens eromheen', komtVoorInBron('"op basis van uur werk"', BON))
toets('zin over een regeleinde',
  komtVoorInBron('ondersteunen bij de firma proline', BON))
toets('dubbele spaties en hoofdletters',
  komtVoorInBron('Dit  Besproken   Via De Mail', BON))

console.log('\n── Wat er niet in mag glippen ───────────────────────────────')
toets('model zegt regie maar wijst niets aan, en de bon noemt niets',
  regieUit(true, null, BON) === false)
toets('model haalt iets aan dat er niet staat',
  regieUit(true, 'wordt afgerekend op nacalculatie', BON) === false)
toets('model zegt geen regie, ook al staat het woord er',
  regieUit(false, null, 'Dit werk gaat op regiebasis.') === false)
toets('te kort fragment telt niet als onderbouwing',
  komtVoorInBron('uur', BON) === false)

console.log('\n── De woordenlijst blijft het vangnet ───────────────────────')
toets('regiebasis', noemtRegie('Het werk wordt op regiebasis uitgevoerd.'))
toets('nacalculatie', noemtRegie('Afrekening vindt plaats op nacalculatie.'))
toets('regio is geen regie', noemtRegie('Wij werken in de regio Haaglanden.') === false)
toets('regisseur is geen regie', noemtRegie('De regisseur van het project.') === false)

console.log(fouten === 0 ? '\nAlles goed\n' : `\n${fouten} fout(en)\n`)
process.exit(fouten === 0 ? 0 : 1)
