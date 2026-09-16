/**
 * Toets: post in de verkeerde bus.
 *
 * Draaien: npx tsx scratch/toets-verkeerde-postbus.ts
 *
 * Een servicedeskbon naar opdrachten@, een offerteaanvraag naar servicedesk@ —
 * dat gebeurt, en het mag niet betekenen dat de bus de behandeling bepaalt.
 */

import { postbusSoortVoorMail } from '../apps/dashboard/src/lib/mailintake/regels'
import { bepaalRoute, type MailSoort, type PostbusSoort } from '../apps/dashboard/src/lib/mailintake/types'

let fouten = 0
const toets = (naam: string, gelukt: boolean, detail = '') => {
  if (!gelukt) fouten++
  console.log(`  ${gelukt ? 'ok   ' : 'FOUT '} ${naam}${gelukt ? '' : ` — ${detail}`}`)
}

console.log('\n── Welke bus hoort bij de inhoud ────────────────────────────')
const verwacht: [MailSoort, PostbusSoort | null][] = [
  ['offerteaanvraag', 'offerteaanvraag'],
  ['opdracht_op_offerte', 'opdracht'],
  ['opdrachtbon', 'opdracht'],
  ['meerwerk', 'opdracht'],
  ['servicedeskbon', 'servicedesk'],
  ['aanvullende_informatie', null],
  ['factuur_of_administratie', null],
  ['overig_geen_werk', null],
]
for (const [soort, doel] of verwacht) {
  const uit = postbusSoortVoorMail(soort)
  toets(`${soort} → ${doel ?? 'geen'}`, uit === doel, String(uit))
}

console.log('\n── De route hangt niet aan de bus ───────────────────────────')
// De route komt uit de soort; de bus komt er niet in voor. Dit legt vast dat dat
// zo blijft: dezelfde soort geeft dezelfde route, waar hij ook binnenkwam.
const gevallen: [string, MailSoort, boolean, string][] = [
  ['servicedeskbon in opdrachten@, met offerte', 'servicedeskbon', true, 'offerte_winnen'],
  ['servicedeskbon in opdrachten@, zonder offerte', 'servicedeskbon', false, 'nieuw_dossier'],
  ['offerteaanvraag in servicedesk@', 'offerteaanvraag', false, 'nieuw_dossier'],
  ['opdrachtbon in aanvragen@', 'opdrachtbon', false, 'offerte_winnen'],
]
for (const [naam, soort, match, doel] of gevallen) {
  const uit = bepaalRoute(soort, match)
  toets(naam + ` → ${doel}`, uit === doel, uit)
}

console.log('\n── De categorieklem hangt aan de inhoud ─────────────────────')
// Zoals verwerken.ts hem nu doorgeeft: op de mailsoort, niet op de postbussoort.
const klem = (mailSoort: MailSoort) => mailSoort === 'servicedeskbon'
toets('servicedeskbon in opdrachten@ wordt geklemd', klem('servicedeskbon') === true)
toets('offerteaanvraag in servicedesk@ wordt NIET geklemd', klem('offerteaanvraag') === false)
toets('opdrachtbon in servicedesk@ wordt NIET geklemd', klem('opdrachtbon') === false)

console.log(fouten === 0 ? '\nAlles goed\n' : `\n${fouten} fout(en)\n`)
process.exit(fouten === 0 ? 0 : 1)
