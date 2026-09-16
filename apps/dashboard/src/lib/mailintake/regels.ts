/**
 * mailintake/regels.ts
 *
 * De bedrijfsregels van de intake: pure functies en lijsten, geen database, geen
 * netwerk, geen `server-only`.
 *
 * Dat laatste is het punt. Dit zijn de regels die bepalen welke werkmaatschappij
 * een aanvraag krijgt en wanneer een bedrag een mandaat is — precies het soort
 * afspraak dat je wilt kunnen nalezen en natoetsen zonder dat er iets in productie
 * beweegt. Stonden ze in extractie.ts, dan zaten ze achter een AI-client en een
 * server-only-import.
 */

import type { MailSoort, PostbusSoort } from './types'

/** De categorie waarvoor de schilders-werkmaatschappij geldt; al het andere gaat naar bouw. */
const SCHILDER_CATEGORIE = 'schilderwerk'
const WM_SCHILDERS = 'everts onderhoudsschilders'
const WM_BOUW = 'bouwbedrijf morgenstond'

/**
 * De twee categorieën waaraan een dossier als servicedeskwerk wordt herkend.
 *
 * Hoofdlettergevoelig, want `isServicedeskDossier` vergelijkt exact. Staat er iets
 * anders, dan verdwijnt de bon van het servicedeskbord zonder dat iemand dat merkt.
 */
export const SERVICEDESK_CATEGORIEEN = ['Dagelijks onderhoud', 'Mutatie']

/** Woorden die een bedrag tot een mandaat maken in plaats van tot een prijsindicatie. */
export const MANDAAT_WOORDEN = [
  'mandaat', 'budget', 'tot maximaal', 'kostenlimiet', 'plafond',
  // Opdrachtbonnen van beheerders schrijven dit op allerlei manieren. "maximaal
  // factuurbedrag" stond in de eerste echte bon die binnenkwam en viel buiten de
  // lijst omdat daar 'maximaal bedrag' stond -- met 'factuur' ertussen.
  'maximaal bedrag', 'maximaal factuurbedrag', 'maximale factuurbedrag',
  'factuurbedrag', 'tot een maximum', 'niet overschrijden', 'bestedingsruimte',
]

/**
 * Woorden waaraan je een regie-opdracht herkent.
 *
 * Regie betekent: geen aanneemsom vooraf, afrekenen op basis van wat het werkelijk
 * is geworden. Dat is niet hetzelfde als servicedeskwerk -- het kan net zo goed een
 * bouwkundige klus zijn -- en er hoort per definitie geen offerte bij, want de prijs
 * staat nog niet vast.
 */
export const REGIE_WOORDEN = [
  'regie', 'regiebasis', 'op regiebasis', 'in regie',
  'uurbasis', 'op uurbasis', 'nacalculatie', 'nacalculatorisch',
  'verrekenbare uren', 'werkelijk bestede uren', 'uurtarief',
]

export type WerkmaatschappijVia = 'mail' | 'categorie' | 'standaard' | 'geen'

/**
 * Welke werkmaatschappij hoort bij dit werk?
 *
 * Rangorde, en die volgorde is de hele regel:
 *  1. de mail noemt er zelf een die op de witte lijst staat;
 *  2. de categorie bepaalt het: schilderwerk naar de schilders, de rest naar bouw;
 *  3. de standaard van de postbus.
 *
 * Stap 1 staat bewust boven stap 2. Zonder die stap zou de derde werkmaatschappij
 * (Dakplan) nooit meer gekozen kunnen worden, ook niet als de opdrachtgever hem
 * letterlijk aanschrijft.
 */
export function kiesWerkmaatschappij(
  uitMail: string | null,
  categorieNaam: string | null,
  lijst: { id: string; naam: string }[],
  standaardId: string | null,
): { id: string | null; via: WerkmaatschappijVia } {
  const genoemd = (uitMail ?? '').trim().toLowerCase()
  if (genoemd) {
    const hit = lijst.find(w => w.naam.toLowerCase() === genoemd)
      ?? lijst.find(w => genoemd.length >= 5 && w.naam.toLowerCase().includes(genoemd))
    if (hit) return { id: hit.id, via: 'mail' }
  }

  const cat = (categorieNaam ?? '').trim().toLowerCase()
  if (cat) {
    const zoek = cat === SCHILDER_CATEGORIE ? WM_SCHILDERS : WM_BOUW
    const hit = lijst.find(w => w.naam.toLowerCase().startsWith(zoek))
    if (hit) return { id: hit.id, via: 'categorie' }
  }

  return standaardId ? { id: standaardId, via: 'standaard' } : { id: null, via: 'geen' }
}

/**
 * Bij welke postbus hoort deze mailsoort inhoudelijk?
 *
 * Post komt lang niet altijd in de goede bus terecht: een servicedeskbon wordt naar
 * opdrachten@ gestuurd, een offerteaanvraag naar servicedesk@. Wat er met zo'n
 * bericht moet gebeuren volgt uit de inhoud, niet uit het adres waar het toevallig
 * binnenkwam -- anders krijgt een offerteaanvraag een servicedeskcategorie omdat de
 * bus dat nu eenmaal afdwingt, en gaat een storing naar de verkeerde behandelaar.
 *
 * `null` = de inhoud zegt er niets over (ruis, aanvullende informatie); dan blijft
 * de bus waar het binnenkwam leidend.
 */
export function postbusSoortVoorMail(soort: MailSoort | null): PostbusSoort | null {
  switch (soort) {
    case 'offerteaanvraag': return 'offerteaanvraag'
    case 'opdracht_op_offerte':
    case 'opdrachtbon':
    case 'meerwerk': return 'opdracht'
    case 'servicedeskbon': return 'servicedesk'
    default: return null
  }
}

/** Datum plus een aantal dagen, als ISO-datum. */
export function datumPlusDagen(iso: string, dagen: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + dagen)
  return d.toISOString().slice(0, 10)
}

/**
 * Noemt de brontekst regiewerk?
 *
 * Bewust op hele woorden: "regie" zit ook in "regio" en "regisseur", en een valse
 * treffer zou een aangenomen opdracht ten onrechte zonder aanneemsom wegzetten.
 */
export function noemtRegie(brontekst: string): boolean {
  const laag = ' ' + brontekst.toLowerCase().replace(/[^a-z0-9]+/g, ' ') + ' '
  return REGIE_WOORDEN.some(w => laag.includes(' ' + w.replace(/[^a-z0-9]+/g, ' ') + ' '))
}

/** Noemt de brontekst een mandaat, of is dat losse bedrag gewoon een prijs? */
export function noemtMandaat(brontekst: string): boolean {
  const laag = brontekst.toLowerCase()
  return MANDAAT_WOORDEN.some(w => laag.includes(w))
}
