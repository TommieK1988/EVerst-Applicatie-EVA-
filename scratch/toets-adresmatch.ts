/**
 * Toets op de adresvergelijking in de duplicaatzoeker.
 *
 * Draaien: npx tsx scratch/toets-adresmatch.ts
 *
 * Geval 1 is het echte: dossier 20267.00748 werd niet gevonden bij de opdrachtbon
 * voor hetzelfde werk, omdat elke adresregel een postcode eiste en die aan beide
 * kanten ontbrak — én omdat het huisnummer van dat dossier in het straatveld stond.
 */

import { adresKern, adresOvereenkomst } from '../apps/dashboard/src/lib/mailintake/regels'

let fouten = 0
const toets = (naam: string, gelukt: boolean, detail = '') => {
  if (!gelukt) fouten++
  console.log(`  ${gelukt ? 'ok   ' : 'FOUT '} ${naam}${gelukt ? '' : ` — ${detail}`}`)
}

// Zoals het dossier er werkelijk in staat: alles in het straatveld, huisnummer leeg,
// postcode leeg. De titel draagt het adres wél volledig.
const DOSSIER = 'Steenlaan 32, 34 en 36  Steenlaan 32, 34 en 36 Rijswijk, ' +
  'bouwkundige werkzaamheden t.b.v. relinen standleidingen'

console.log('\n── Het geval dat misging ────────────────────────────────────')
const uit = adresOvereenkomst('Steenlaan', '32, 34 & 36', DOSSIER)
toets('opdrachtbon vindt dossier 20267.00748', uit === 'straat_en_nummer', String(uit))
toets('ook met "en" in plaats van "&"',
  adresOvereenkomst('Steenlaan', '32, 34 en 36', DOSSIER) === 'straat_en_nummer')
toets('ook als er maar één nummer overlapt',
  adresOvereenkomst('Steenlaan', '34', DOSSIER) === 'straat_en_nummer')

console.log('\n── Straat zonder nummer telt licht ──────────────────────────')
// Een VvE-complex heeft al het werk aan dezelfde straat. Zou dat zwaar wegen, dan
// werd elke nieuwe aanvraag als mogelijk duplicaat aangemerkt.
toets('zelfde straat, ander huisnummer → alleen straat',
  adresOvereenkomst('Steenlaan', '78', DOSSIER) === 'straat')
toets('andere straat → niets',
  adresOvereenkomst('Delftselaan', '32', DOSSIER) === null)

console.log('\n── Postcodes tellen niet als huisnummer ─────────────────────')
const kern = adresKern("'VvE 8266 Steenlaan 30-152', Postbus 612, 2700 AP Zoetermeer")
toets('2700 uit "2700 AP" telt niet mee', !kern.nummers.includes('2700'), kern.nummers.join(','))
toets('612 telt wel mee', kern.nummers.includes('612'))

console.log('\n── Straat en nummers uit elkaar halen ───────────────────────')
const k2 = adresKern('Steenlaan 32, 34 en 36')
toets('straat = steenlaan', k2.straat === 'steenlaan', k2.straat)
toets('nummers = 32, 34, 36', k2.nummers.join(',') === '32,34,36', k2.nummers.join(','))

const k3 = adresKern('Van Speykstraat 112')
toets('straat met meerdere woorden', k3.straat === 'van speykstraat', k3.straat)

console.log('\n── Te weinig om op te varen ─────────────────────────────────')
toets('lege straat → niets', adresOvereenkomst(null, '32', DOSSIER) === null)
toets('korte straat → niets', adresOvereenkomst('Ln', '32', DOSSIER) === null)

console.log(fouten === 0 ? '\nAlles goed\n' : `\n${fouten} fout(en)\n`)
process.exit(fouten === 0 ? 0 : 1)
