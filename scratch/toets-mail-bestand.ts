/**
 * Toets op de .eml die EVA zelf opmaakt als het origineel niet op te halen is.
 *
 *   npx tsx scratch/toets-mail-bestand.ts
 *
 * Een .eml is gewoon tekst, dus "het ziet er goed uit" is hier misleidend: een
 * mailclient valt om op een kopregel met een accent erin, op een base64-regel
 * langer dan 76 tekens, en op LF zonder CR. Dat zijn precies de dingen die je pas
 * merkt als iemand het bestand in Outlook probeert te openen.
 */

import { bouwEmlUitBericht } from '../apps/dashboard/src/lib/mailintake/mail-bestand'

let fouten = 0
const toets = (naam: string, gelukt: boolean, detail = '') => {
  if (!gelukt) fouten++
  console.log(`  ${gelukt ? 'ok   ' : 'FOUT '} ${naam}${gelukt ? '' : ` — ${detail}`}`)
}

const BERICHT = {
  onderwerp: 'Vervolg project Bachstraat Leiden — relining fase 2',
  van_naam: 'Frits de Zwart',
  van_adres: 'f.dezwart@hetvastgoedbureau.nl',
  aan: ['opdrachten@everts.nl'],
  cc: ['collega@hetvastgoedbureau.nl'],
  ontvangen_op: '2026-09-15T14:07:26+00:00',
  body_tekst: 'Beste,\n\nGraag ontvangen wij een prijs voor de modelstrang.\n\nGroet, Frits',
  aantalBijlagen: 2,
}

const eml = bouwEmlUitBericht(BERICHT).toString('utf-8')
const regels = eml.split('\r\n')

console.log('\n── Kopregels ────────────────────────────────────────────────')
toets('From met naam en adres', eml.includes('From: Frits de Zwart <f.dezwart@hetvastgoedbureau.nl>'))
toets('To staat erin', eml.includes('To: opdrachten@everts.nl'))
toets('Cc staat erin', eml.includes('Cc: collega@hetvastgoedbureau.nl'))
toets('Date is een geldige datum',
  !Number.isNaN(Date.parse(regels.find(r => r.startsWith('Date: '))?.slice(6) ?? '')))

// Het onderwerp heeft een em-dash; ongecodeerd breekt dat in elke mailclient.
const subject = regels.find(r => r.startsWith('Subject: ')) ?? ''
toets('onderwerp met een em-dash is gecodeerd', subject.startsWith('Subject: =?UTF-8?B?'), subject)
toets('gecodeerde onderwerp decodeert terug', (() => {
  const b64 = subject.replace('Subject: =?UTF-8?B?', '').replace('?=', '')
  return Buffer.from(b64, 'base64').toString('utf-8') === BERICHT.onderwerp
})())

console.log('\n── Vorm ─────────────────────────────────────────────────────')
toets('elke regel eindigt op CRLF', !/[^\r]\n/.test(eml))
toets('lege regel tussen kop en body', eml.includes('\r\n\r\n'))

const body = eml.split('\r\n\r\n').slice(1).join('\r\n\r\n')
toets('geen base64-regel boven de 76 tekens',
  body.split('\r\n').every(r => r.length <= 76),
  String(Math.max(...body.split('\r\n').map(r => r.length))))

const ontcijferd = Buffer.from(body.replace(/\r\n/g, ''), 'base64').toString('utf-8')
console.log('\n── Inhoud ───────────────────────────────────────────────────')
toets('de mailtekst zit erin', ontcijferd.includes('Graag ontvangen wij een prijs'))
toets('het zegt dat dit een weergave is', ontcijferd.includes('door EVA opgemaakt'))
toets('het noemt waar de bijlagen staan', ontcijferd.includes('2 bijlagen staan los in deze map'))

console.log('\n── Randgevallen ─────────────────────────────────────────────')
const leeg = bouwEmlUitBericht({
  onderwerp: null, van_naam: null, van_adres: null, aan: null, cc: null,
  ontvangen_op: '2026-01-02T00:00:00Z', body_tekst: null, aantalBijlagen: 0,
}).toString('utf-8')
toets('zonder onderwerp valt terug', leeg.includes('Subject: (geen onderwerp)'))
toets('zonder afzender valt terug', leeg.includes('From: onbekend'))
toets('lege Cc geeft geen kale kopregel', !leeg.includes('Cc:'))
toets('zonder bijlagen zegt het dat ook',
  Buffer.from(leeg.split('\r\n\r\n').slice(1).join('').replace(/\r\n/g, ''), 'base64')
    .toString('utf-8').includes('geen bijlagen'))

console.log(fouten === 0 ? '\nAlles goed\n' : `\n${fouten} fout(en)\n`)
process.exit(fouten === 0 ? 0 : 1)
