/**
 * Toets op de projectomschrijving die naar Bouw7 gaat.
 *
 * Draaien: npx tsx scratch/toets-omschrijving.ts
 *
 * Twee dingen kunnen hier stilletjes misgaan en allebei zijn ze pas in Bouw7
 * zichtbaar: broninhoud die de eigen opmaak breekt, en een kopje dat er staat
 * terwijl er niets onder hoort te staan.
 */

import { bouwOmschrijvingHtml, ontsnapHtml } from '../apps/dashboard/src/lib/mailintake/omschrijving'

let fouten = 0
const toets = (naam: string, gelukt: boolean, detail = '') => {
  if (!gelukt) fouten++
  console.log(`  ${gelukt ? 'ok   ' : 'FOUT '} ${naam}${gelukt ? '' : ` -- ${detail}`}`)
}

console.log('\n-- De drie delen --------------------------------------------')
const vol = bouwOmschrijvingHtml({
  scope: '- Dak geheel vervangen als overlagen niet mogelijk is\n- Voorgevel houtwerk schilderen',
  buitenScope: 'Asbestsanering',
  aandachtspunten: '- Bewoners blijven in de woning',
})
toets('Scope staat erin', vol.includes('<strong>Scope</strong>'))
toets('Buiten scope staat erin', vol.includes('<strong>Buiten scope</strong>'))
toets('Aandachtspunten staat erin', vol.includes('<strong>Aandachtspunten</strong>'))
toets('regels krijgen een bolletje', vol.includes('• Dak geheel vervangen'))
toets('bestaand streepje is weggehaald', !vol.includes('• - Dak'))
toets('twee regels onder Scope', (vol.match(/• /g) ?? []).length === 4, vol)

console.log('\n-- Lege delen krijgen geen kopje ----------------------------')
// Een leeg "Buiten scope" zou lezen als "er is niets uitgesloten", en dat is iets
// anders dan "de aanvraag zegt er niets over".
const alleenScope = bouwOmschrijvingHtml({
  scope: 'Voorgevel schilderen', buitenScope: null, aandachtspunten: '',
})
toets('geen kopje Buiten scope als er niets is', !alleenScope.includes('Buiten scope'))
toets('geen kopje Aandachtspunten als er niets is', !alleenScope.includes('Aandachtspunten'))
toets('helemaal niets levert een lege tekst',
  bouwOmschrijvingHtml({ scope: null, buitenScope: null, aandachtspunten: null }) === '')
toets('alleen witregels tellen niet mee',
  bouwOmschrijvingHtml({ scope: '\n\n  \n', buitenScope: null, aandachtspunten: null }) === '')

console.log('\n-- Broninhoud mag de opmaak niet breken ----------------------')
toets('ampersand', ontsnapHtml('Jansen & Zn') === 'Jansen &amp; Zn')
toets('kleiner-dan', ontsnapHtml('afmeting < 2 m') === 'afmeting &lt; 2 m')
toets('groter-dan', ontsnapHtml('> 40 punten') === '&gt; 40 punten')
toets('ampersand eerst, niet dubbel ontsnapt',
  ontsnapHtml('a & <b>') === 'a &amp; &lt;b&gt;', ontsnapHtml('a & <b>'))

// Het echte risico: een stuk HTML uit een mailhandtekening of een bestek dat
// ongezien in het veld belandt en daar de rest van de opmaak meeneemt.
const metHtml = bouwOmschrijvingHtml({
  scope: '<img src=x onerror=alert(1)> gevel schilderen',
  buitenScope: null, aandachtspunten: null,
})
toets('een tag uit de bron wordt tekst', !metHtml.includes('<img'), metHtml)
toets('en blijft wel leesbaar', metHtml.includes('&lt;img'))

console.log('\n-- Vorm ------------------------------------------------------')
toets('gebruikt <p> en <br>, geen markdown',
  vol.includes('<p>') && vol.includes('<br>') && !vol.includes('**'))

console.log(fouten === 0 ? '\nAlles goed\n' : `\n${fouten} fout(en)\n`)
process.exit(fouten === 0 ? 0 : 1)
