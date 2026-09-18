/**
 * Toets op het onderwerp-normaliseren van de groepeerregels.
 *
 * Draaien: npx tsx scratch/toets-groeperen.ts
 *
 * De databasekant (gesprek, bijlage-hash, werkadres) is hier niet te toetsen zonder
 * netwerk; die staat in de verificatie op productie. Wat hier telt is de regel die
 * het vaakst fout kan gaan: wanneer zijn twee onderwerpen hetzelfde, en -- veel
 * belangrijker -- wanneer juist niet. Twee klussen ten onrechte samenvoegen is
 * erger dan ze uit elkaar laten, want dan gaat de bon naar het verkeerde dossier.
 */

import { kaalOnderwerp } from '../apps/dashboard/src/lib/mailintake/regels'

let fouten = 0
const toets = (naam: string, gelukt: boolean, detail = '') => {
  if (!gelukt) fouten++
  console.log(`  ${gelukt ? 'ok   ' : 'FOUT '} ${naam}${gelukt ? '' : ` -- ${detail}`}`)
}
const zelfde = (a: string, b: string) => kaalOnderwerp(a) === kaalOnderwerp(b)

console.log('\n-- Aanloopjes eraf ------------------------------------------')
toets('Re: eraf', zelfde('Re: Steenlaan 32', 'Steenlaan 32'))
toets('FW: eraf', zelfde('FW: Steenlaan 32', 'Steenlaan 32'))
toets('Antw: eraf', zelfde('Antw: Steenlaan 32', 'Steenlaan 32'))
toets('Doorst: eraf', zelfde('Doorst: Steenlaan 32', 'Steenlaan 32'))
toets('gestapeld', zelfde('Re: FW: Antw: Steenlaan 32', 'Steenlaan 32'))
toets('RE[2]: eraf', zelfde('RE[2]: Steenlaan 32', 'Steenlaan 32'))
toets('hoofdletters maken niet uit', zelfde('re: STEENLAAN 32', 'Steenlaan 32'))

console.log('\n-- Verschillende klussen blijven uit elkaar -----------------')
toets('ander huisnummer', !zelfde('Re: Steenlaan 32', 'Steenlaan 78'))
toets('andere straat', !zelfde('Re: Steenlaan 32', 'Delftselaan 32'))
// Het echte geval: twee mails over dezelfde klus met heel andere onderwerpen. Het
// onderwerp vangt ze niet -- dat hoort ook niet. Ze horen bij elkaar te komen via
// het werkadres, en die regel staat in zoekGroepAchteraf.
toets('bon en antwoord matchen niet op onderwerp',
  !zelfde('FW: Onderhoudsopdracht - Opdrachtbon 8266-142988-1',
          'Re: Steenlaan 32, 34 & 34 te Rijswijk.'))

console.log('\n-- Te kort om op te varen ----------------------------------')
// zoekGroepVooraf eist twaalf tekens; "opdracht" zou anders alles aan alles knopen.
toets('"Opdracht" is te kort', kaalOnderwerp('Re: Opdracht').length < 12)
toets('"Offerteaanvraag" is lang genoeg', kaalOnderwerp('Offerteaanvraag').length >= 12)
toets('leeg onderwerp geeft leeg', kaalOnderwerp(null) === '')
toets('alleen een aanloopje geeft leeg', kaalOnderwerp('Re:') === '')

console.log(fouten === 0 ? '\nAlles goed\n' : `\n${fouten} fout(en)\n`)
process.exit(fouten === 0 ? 0 : 1)
