/**
 * Toets op de routekeuze en de beslisboom.
 *
 * Draaien: npx tsx scratch/toets-routes.ts
 *
 * Deze toets raakt geen database en geen netwerk — `beslis.ts` en `types.ts` zijn
 * pure modules. Dat is precies waarom ze zo geschreven zijn: de regel die bepaalt
 * of EVA zelfstandig een dossier aanmaakt of een offerte wint, moet na te rekenen
 * zijn zonder dat er iets in productie beweegt.
 */

import { beslis, type BeslisInvoer } from '../apps/dashboard/src/lib/mailintake/beslis'
import { bepaalRoute } from '../apps/dashboard/src/lib/mailintake/types'

let fouten = 0
let gedaan = 0

function toets(naam: string, gelukt: boolean, detail?: string) {
  gedaan++
  if (gelukt) {
    console.log(`  ok    ${naam}`)
  } else {
    fouten++
    console.log(`  FOUT  ${naam}${detail ? ` — ${detail}` : ''}`)
  }
}

/** Een invoer waarin alles goed staat; elke toets zet er één ding in verkeerd. */
function basis(patch: Partial<BeslisInvoer> = {}): BeslisInvoer {
  return {
    automatischToegestaan: true,
    soort: 'offerteaanvraag',
    soortVertrouwen: 0.95,
    afzenderScore: 1,
    aantalRelatieKandidaten: 1,
    veldenCompleet: true,
    adresBevestigd: true,
    vertrouwen: { omschrijving: 1, werkadres_straat: 1, categorie_voorstel: 1 },
    duplicaatTopscore: 0,
    offerteMatchGevonden: false,
    offerteMatchHard: false,
    regie: false,
    isAntwoord: false,
    meerdereWerkadressen: false,
    ongelezenBijlage: false,
    dagbudgetOp: false,
    bouw7Gereed: true,
    bouw7Ontbreekt: [],
    ...patch,
  }
}

console.log('\n── Route per soort ──────────────────────────────────────────')
toets('offerteaanvraag → nieuw dossier', bepaalRoute('offerteaanvraag', false) === 'nieuw_dossier')
toets('opdracht_op_offerte → offerte winnen', bepaalRoute('opdracht_op_offerte', true) === 'offerte_winnen')
toets('opdrachtbon → offerte winnen, ook zonder treffer',
  bepaalRoute('opdrachtbon', false) === 'offerte_winnen')
toets('servicedeskbon mét offerte → offerte winnen',
  bepaalRoute('servicedeskbon', true) === 'offerte_winnen')
toets('servicedeskbon zónder offerte → nieuw dossier',
  bepaalRoute('servicedeskbon', false) === 'nieuw_dossier')
toets('meerwerk → geen eigen route', bepaalRoute('meerwerk', true) === 'geen')
toets('nieuwsbrief → geen route', bepaalRoute('overig_geen_werk', false) === 'geen')

console.log('\n── Wat mag automatisch ──────────────────────────────────────')
const a = beslis(basis())
toets('complete aanvraag mag automatisch', a.automatisch && a.status === 'verwerkt', a.redenen[0])

const opdrachtZonderTreffer = beslis(basis({ soort: 'opdrachtbon' }))
toets('opdracht zonder offerte gaat naar een mens',
  !opdrachtZonderTreffer.automatisch && opdrachtZonderTreffer.status === 'wacht_op_mens',
  opdrachtZonderTreffer.redenen[0])
toets('… en houdt wel de opdrachtroute',
  opdrachtZonderTreffer.route === 'offerte_winnen', opdrachtZonderTreffer.route)

const zachteTreffer = beslis(basis({
  soort: 'opdracht_op_offerte', offerteMatchGevonden: true, offerteMatchHard: false,
}))
toets('opdracht met een zachte offertetreffer gaat naar een mens',
  !zachteTreffer.automatisch, zachteTreffer.redenen[0])

const hardeTreffer = beslis(basis({
  soort: 'opdracht_op_offerte', offerteMatchGevonden: true, offerteMatchHard: true,
}))
toets('opdracht met een harde treffer mag automatisch',
  hardeTreffer.automatisch && hardeTreffer.route === 'offerte_winnen', hardeTreffer.redenen[0])

const hardeTrefferAntwoord = beslis(basis({
  soort: 'opdracht_op_offerte', offerteMatchGevonden: true, offerteMatchHard: true, isAntwoord: true,
}))
toets('een akkoord als reply blokkeert de opdrachtroute niet',
  hardeTrefferAntwoord.automatisch, hardeTrefferAntwoord.redenen[0])

const aanvraagAntwoord = beslis(basis({ isAntwoord: true }))
toets('een aanvraag als reply gaat wél naar een mens',
  !aanvraagAntwoord.automatisch, aanvraagAntwoord.redenen[0])

console.log('\n── De remmen ────────────────────────────────────────────────')
const remmen: [string, Partial<BeslisInvoer>][] = [
  ['twijfel over de soort', { soortVertrouwen: 0.89 }],
  ['onbekende afzender', { afzenderScore: 0 }],
  ['twee mogelijke klanten', { aantalRelatieKandidaten: 2 }],
  ['onvolledige velden', { veldenCompleet: false }],
  ['adres niet bevestigd', { adresBevestigd: false }],
  ['laag veldvertrouwen', { vertrouwen: { omschrijving: 0.5, werkadres_straat: 1, categorie_voorstel: 1 } }],
  ['Bouw7 niet gereed', { bouw7Gereed: false, bouw7Ontbreekt: ['Klant staat niet in Bouw7.'] }],
  ['mogelijk duplicaat', { duplicaatTopscore: 0.6 }],
  ['meerdere werkadressen', { meerdereWerkadressen: true }],
  ['onleesbare bijlage', { ongelezenBijlage: true }],
  ['dagbudget op', { dagbudgetOp: true }],
  ['automatisch staat uit', { automatischToegestaan: false }],
]
for (const [naam, patch] of remmen) {
  const r = beslis(basis(patch))
  toets(naam, !r.automatisch && r.status === 'wacht_op_mens', `${r.status}/${r.automatisch}`)
}

console.log('\n── Ruis ─────────────────────────────────────────────────────')
const ruisZeker = beslis(basis({ soort: 'overig_geen_werk', soortVertrouwen: 0.97 }))
toets('zekere ruis → geen aanvraag', ruisZeker.status === 'geen_aanvraag', ruisZeker.status)

const ruisTwijfel = beslis(basis({ soort: 'overig_geen_werk', soortVertrouwen: 0.7 }))
toets('twijfel over ruis → tóch een mens', ruisTwijfel.status === 'wacht_op_mens', ruisTwijfel.status)

const aanvullend = beslis(basis({ soort: 'aanvullende_informatie', soortVertrouwen: 0.99 }))
toets('aanvullende informatie → een mens, nooit geparkeerd',
  aanvullend.status === 'wacht_op_mens', aanvullend.status)

const meerwerk = beslis(basis({ soort: 'meerwerk', offerteMatchGevonden: true, offerteMatchHard: true }))
toets('meerwerk gaat nooit automatisch', !meerwerk.automatisch, meerwerk.redenen[0])


// ── Regie ────────────────────────────────────────────────────────────────────
// Bij regie staat de prijs juist niet vast, dus er is geen offerte om te winnen.
console.log('\n── Regie ────────────────────────────────────────────────────')
toets('opdrachtbon met regie → nieuw dossier',
  bepaalRoute('opdrachtbon', false, true) === 'nieuw_dossier')
toets('opdrachtbon met regie én een offertetreffer → offerte winnen',
  bepaalRoute('opdrachtbon', true, true) === 'offerte_winnen')
toets('opdrachtbon zonder regie → offerte winnen',
  bepaalRoute('opdrachtbon', true, false) === 'offerte_winnen')
toets('servicedeskbon met regie én offerte → offerte winnen',
  bepaalRoute('servicedeskbon', true, true) === 'offerte_winnen')

const regieBesluit = beslis(basis({ soort: 'opdrachtbon', regie: true }))
toets('regie zonder offerte loopt de aanmaakroute',
  regieBesluit.route === 'nieuw_dossier', regieBesluit.route)


// ── Regie mét een offerte ────────────────────────────────────────────────────
// Er wordt wel degelijk een offerte uitgebracht om een uurtarief vast te leggen.
// De opdracht die daarop volgt verwijst er lang niet altijd naar, maar het blijft
// een opdracht op die offerte.
console.log('\n── Regie mét een offerte ────────────────────────────────────')
toets('regie + offerte gevonden → offerte winnen',
  bepaalRoute('opdrachtbon', true, true) === 'offerte_winnen')
toets('regie zónder offerte → nieuw dossier',
  bepaalRoute('opdrachtbon', false, true) === 'nieuw_dossier')
toets('geen regie, geen offerte → toch de offerteroute (mens wijst aan)',
  bepaalRoute('opdrachtbon', false, false) === 'offerte_winnen')
toets('servicedeskbon met regie én offerte → offerte winnen',
  bepaalRoute('servicedeskbon', true, true) === 'offerte_winnen')

console.log(`\n${gedaan - fouten}/${gedaan} geslaagd\n`)

process.exit(fouten === 0 ? 0 : 1)
