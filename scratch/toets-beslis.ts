/**
 * Toets op de beslissing: classificeren, verzamelen, dan pas beslissen.
 *
 *   npx tsx scratch/toets-beslis.ts
 *
 * De regel die hier telt is niet "wordt het goede besluit genomen" maar **wordt
 * er niet te vroeg gestopt**. Dit bestand hield op bij het eerste bezwaar, en
 * daardoor kreeg de behandelaar een half formulier met één regel uitleg — wat
 * eruitziet als een onvolledige aanvraag terwijl EVA gewoon te vroeg stopte.
 *
 * Twee dingen worden hier dus hard vastgelegd: bij voorleggen komen álle
 * bezwaren mee, en één bezwaar is genoeg om de automaat tegen te houden.
 */

import { beslis, samenvattendeReden } from '../apps/dashboard/src/lib/mailintake/beslis'
import type { MailSoort } from '../apps/dashboard/src/lib/mailintake/types'

let fouten = 0
const toets = (naam: string, gelukt: boolean, detail = '') => {
  if (!gelukt) fouten++
  console.log(`  ${gelukt ? 'ok   ' : 'FOUT '} ${naam}${gelukt ? '' : ` — ${detail}`}`)
}

/** Een bericht waar niets mis mee is: bekende klant, alles compleet. */
const GOED = {
  automatischToegestaan: true,
  soort: 'offerteaanvraag' as MailSoort | null,
  soortVertrouwen: 0.95,
  afzenderScore: 1,
  aantalRelatieKandidaten: 1,
  veldenCompleet: true,
  adresBevestigd: true,
  vertrouwen: { omschrijving: 0.9, werkadres_straat: 1, categorie_voorstel: 0.9 },
  duplicaatTopscore: 0,
  offerteMatchGevonden: false,
  regie: false,
  offerteMatchHard: false,
  meerdereWerkadressen: false,
  ongelezenBijlage: false,
  dagbudgetOp: false,
  bouw7Gereed: true,
  bouw7Ontbreekt: [] as string[],
}

console.log('\n── Niets in de weg ──────────────────────────────────────────')
const goed = beslis(GOED)
toets('gaat automatisch', goed.automatisch)
toets('status verwerkt', goed.status === 'verwerkt')
toets('route nieuw dossier', goed.route === 'nieuw_dossier')

console.log('\n── Alle bezwaren komen mee, niet alleen de eerste ───────────')
// Drie dingen tegelijk mis. Vroeger zag je er één en waren de andere twee niet
// eens gecontroleerd.
const drie = beslis({
  ...GOED,
  afzenderScore: 0,
  adresBevestigd: false,
  duplicaatTopscore: 0.9,
})
toets('niet automatisch', !drie.automatisch)
toets('drie bezwaren op een rij', drie.redenen.length >= 3, `${drie.redenen.length}: ${drie.redenen.join(' | ')}`)
toets('afzender staat erbij', drie.redenen.some(r => r.includes('afzender')))
toets('adres staat erbij', drie.redenen.some(r => r.includes('werkadres')))
toets('duplicaat staat erbij', drie.redenen.some(r => r.includes('al is ingeschreven')))

console.log('\n── Eén bezwaar is genoeg om tegen te houden ─────────────────')
for (const [naam, patch] of [
  ['onzekere soort', { soortVertrouwen: 0.7 }],
  ['onbekende afzender', { afzenderScore: 0.2 }],
  ['twee klantkandidaten', { afzenderScore: 0.5, aantalRelatieKandidaten: 2 }],
  ['meerdere werkadressen', { meerdereWerkadressen: true }],
  ['onleesbare bijlage', { ongelezenBijlage: true }],
  ['velden incompleet', { veldenCompleet: false }],
  ['adres onbevestigd', { adresBevestigd: false }],
  ['laag veldvertrouwen', { vertrouwen: { omschrijving: 0.2 } }],
  ['Bouw7 niet gereed', { bouw7Gereed: false, bouw7Ontbreekt: ['De klant staat niet in Bouw7.'] }],
  ['duplicaat', { duplicaatTopscore: 0.9 }],
] as [string, Partial<typeof GOED>][]) {
  const r = beslis({ ...GOED, ...patch })
  toets(naam, !r.automatisch && r.status === 'wacht_op_mens', JSON.stringify(r.redenen))
}

console.log('\n── Bouw7 levert zijn eigen regels aan ───────────────────────')
const b7 = beslis({
  ...GOED, bouw7Gereed: false,
  bouw7Ontbreekt: ['De klant staat niet in Bouw7.', 'Er is geen categorie gekozen.'],
})
toets('beide Bouw7-regels komen door', b7.redenen.length >= 2 &&
  b7.redenen.some(r => r.includes('klant')) && b7.redenen.some(r => r.includes('categorie')),
  b7.redenen.join(' | '))

console.log('\n── Overige post gaat de deur uit, niet naar een mens ────────')
for (const soort of ['overig_geen_werk', 'factuur_of_administratie', 'aanvullende_informatie']) {
  const r = beslis({ ...GOED, soort: soort as MailSoort, soortVertrouwen: 0.95 })
  toets(`${soort} wordt geen aanvraag`, r.status === 'geen_aanvraag', r.status)
}
// Ook bij twijfel: het hoort in de mailbox, niet in het postvak.
const twijfelRuis = beslis({ ...GOED, soort: 'overig_geen_werk' as MailSoort, soortVertrouwen: 0.4 })
toets('ook bij twijfel de deur uit', twijfelRuis.status === 'geen_aanvraag', twijfelRuis.status)
const geenSoort = beslis({ ...GOED, soort: null })
toets('onbepaalbaar gaat ook de deur uit', geenSoort.status === 'geen_aanvraag', geenSoort.status)

console.log('\n── Een mens die zegt dat het werk is, wint ──────────────────')
// Uit het archief naar Te behandelen gehaald: EVA mag het niet terugzetten.
const teruggehaald = beslis({
  ...GOED, soort: 'overig_geen_werk' as MailSoort, soortVertrouwen: 0.95, mensZegtWerk: true,
})
toets('gaat niet opnieuw de deur uit', teruggehaald.status !== 'geen_aanvraag', teruggehaald.status)
const teruggehaaldLeeg = beslis({ ...GOED, soort: null, mensZegtWerk: true })
toets('zonder soort ook niet', teruggehaaldLeeg.status === 'wacht_op_mens', teruggehaaldLeeg.status)

console.log('\n── "Mag niet" is iets anders dan "klopt niet" ───────────────')
const uitgezet = beslis({ ...GOED, automatischToegestaan: false })
toets('postbus op handmatig houdt tegen', !uitgezet.automatisch)
toets('maar noemt geen gebrek aan het bericht',
  !uitgezet.redenen.some(r => r.includes('niet zeker') || r.includes('ontbreek')),
  uitgezet.redenen.join(' | '))

console.log('\n── Opdracht op een bestaande offerte ────────────────────────')
const opdracht = { ...GOED, soort: 'opdracht_op_offerte' as MailSoort, offerteMatchGevonden: true }
toets('harde treffer gaat automatisch', beslis({ ...opdracht, offerteMatchHard: true }).automatisch)
toets('zachte treffer niet', !beslis({ ...opdracht, offerteMatchHard: false }).automatisch)
toets('geen treffer niet',
  !beslis({ ...opdracht, offerteMatchGevonden: false, offerteMatchHard: false }).automatisch)

console.log('\n── Eén regel voor in het overzicht ──────────────────────────')
toets('telt de rest mee', samenvattendeReden(drie).includes('+'), samenvattendeReden(drie))
toets('bij één bezwaar geen teller',
  !samenvattendeReden(beslis({ ...GOED, adresBevestigd: false })).includes('+'))

console.log(fouten === 0 ? '\nAlles goed\n' : `\n${fouten} fout(en)\n`)
process.exit(fouten === 0 ? 0 : 1)
