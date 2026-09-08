/**
 * mailintake/beslis.ts
 *
 * Wat gebeurt er met dit bericht? Eén functie, zonder database en zonder
 * netwerk, zodat de regel na te lezen én na te rekenen is.
 *
 * De belofte die dit bestand waarmaakt: **bij twijfel voorleggen**. Automatisch
 * aanmaken is de uitzondering die aan álle voorwaarden voldoet. Er is geen enkel
 * pad waarin onzekerheid tot een automatische handeling leidt — zie `redenen`,
 * die precies vertelt welke voorwaarde de doorslag gaf.
 *
 * Let op de asymmetrie bij de soort: twijfel over "dit is werk" en twijfel over
 * "dit is geen werk" leiden allebei naar een mens. Dat is geen slordigheid maar
 * de kern: een gemiste aanvraag is duurder dan een overbodige klik.
 */

import {
  AFZENDER_AUTOMATISCH, SOORT_ZEKER, SOORT_ONZEKER, DUPLICAAT_TWIJFEL,
  VELD_BETROUWBAAR, AUTOMATISCH_TOEGESTANE_SOORTEN, WERK_SOORTEN,
  type BerichtStatus, type MailSoort,
} from './types'

export interface BeslisInvoer {
  /** Staat automatisch aanmaken aan voor deze postbus? */
  automatischToegestaan: boolean
  soort: MailSoort | null
  soortVertrouwen: number
  afzenderScore: number
  aantalRelatieKandidaten: number
  /** Zijn de verplichte velden van het aanvraagformulier compleet? */
  veldenCompleet: boolean
  adresBevestigd: boolean
  vertrouwen: Record<string, number>
  duplicaatTopscore: number
  isAntwoord: boolean
  meerdereWerkadressen: boolean
  /** Er zat een bijlage bij die niet gelezen kon worden. */
  ongelezenBijlage: boolean
  dagbudgetOp: boolean
}

export interface Besluit {
  status: BerichtStatus
  /** true = EVA mag zelf een dossier aanmaken. */
  automatisch: boolean
  /** Leesbare redenen; de eerste is de doorslaggevende. */
  redenen: string[]
}

/**
 * Bepaalt de uitkomst. De volgorde van de controles is de volgorde waarin een
 * mens ze zou stellen: is dit werk, kennen we de afzender, is het compleet,
 * bestaat het al.
 */
export function beslis(inv: BeslisInvoer): Besluit {
  const redenen: string[] = []

  // ── 1. Is dit überhaupt werk? ─────────────────────────────────────────────
  if (inv.soort == null) {
    return { status: 'wacht_op_mens', automatisch: false, redenen: ['EVA kon niet bepalen wat voor bericht dit is.'] }
  }

  // Hoort bij een lopend traject: geen nieuw dossier, maar zeker niet parkeren.
  // Iemand moet de bijlagen aan het juiste dossier hangen.
  if (inv.soort === 'aanvullende_informatie') {
    return {
      status: 'wacht_op_mens',
      automatisch: false,
      redenen: ['Dit hoort bij een traject dat al loopt — koppel het aan het juiste dossier.'],
    }
  }

  const isWerk = WERK_SOORTEN.includes(inv.soort)

  if (!isWerk) {
    // Alleen bij hoge zekerheid parkeren we het als "geen aanvraag". Twijfelt het
    // model, dan kijkt er een mens naar — want dit is de fout die niemand ziet.
    if (inv.soortVertrouwen >= SOORT_ZEKER) {
      return {
        status: 'geen_aanvraag',
        automatisch: false,
        redenen: [`Beoordeeld als "${inv.soort}" met hoge zekerheid; geen aanvraag of opdracht.`],
      }
    }
    return {
      status: 'wacht_op_mens',
      automatisch: false,
      redenen: [`Lijkt geen aanvraag, maar EVA twijfelt (${Math.round(inv.soortVertrouwen * 100)}%) — controleer dit zelf.`],
    }
  }

  // Vanaf hier: het lijkt werk. Alle onderstaande controles kunnen alleen nog
  // maar remmen, nooit versnellen.
  //
  // Let op de `return` hieronder. Zonder die return zou twijfel over de soort
  // alleen een regel tekst opleveren en zou het bericht daarna gewoon de
  // automatische route in lopen — het tegenovergestelde van wat deze module
  // belooft. Dat is precies de fout die de toets in scratch/toets-beslis eruit haalde.
  if (inv.soortVertrouwen < SOORT_ZEKER) {
    redenen.unshift(
      inv.soortVertrouwen < SOORT_ONZEKER
        ? `EVA is onzeker over wat voor bericht dit is (${Math.round(inv.soortVertrouwen * 100)}%).`
        : `EVA denkt aan "${inv.soort}", maar niet zeker genoeg om zelf te handelen.`,
    )
    return { status: 'wacht_op_mens', automatisch: false, redenen }
  }

  // ── 2. Raakt dit een bestaand dossier? ────────────────────────────────────
  // Opdracht op onze offerte en meerwerk gaan nóóit automatisch: die veranderen
  // de status van iets dat al loopt, met gevolgen tot in Bouw7.
  if (!AUTOMATISCH_TOEGESTANE_SOORTEN.includes(inv.soort)) {
    redenen.unshift(
      inv.soort === 'opdracht_op_offerte'
        ? 'Dit lijkt een akkoord op een offerte van ons — dat raakt een bestaand dossier.'
        : 'Dit lijkt meerwerk op een lopende opdracht.',
    )
    return { status: 'wacht_op_mens', automatisch: false, redenen }
  }

  // ── 3. Kennen we de afzender? ─────────────────────────────────────────────
  if (inv.afzenderScore < AFZENDER_AUTOMATISCH) {
    redenen.unshift(
      inv.afzenderScore <= 0
        ? 'De afzender is niet herkend als bestaande klant.'
        : 'De afzender is niet zeker genoeg herkend.',
    )
    return { status: 'wacht_op_mens', automatisch: false, redenen }
  }
  if (inv.aantalRelatieKandidaten !== 1) {
    redenen.unshift(`Er zijn ${inv.aantalRelatieKandidaten} mogelijke opdrachtgevers — kies de juiste.`)
    return { status: 'wacht_op_mens', automatisch: false, redenen }
  }

  // ── 4. Remmen die losstaan van hoe zeker het model is ─────────────────────
  if (inv.isAntwoord) {
    redenen.unshift('Dit is een antwoord in een lopend gesprek; dat hoort bijna altijd bij iets dat al bestaat.')
    return { status: 'wacht_op_mens', automatisch: false, redenen }
  }
  if (inv.meerdereWerkadressen) {
    redenen.unshift('De mail betreft werk op meerdere adressen; dat wordt niet één dossier.')
    return { status: 'wacht_op_mens', automatisch: false, redenen }
  }
  if (inv.ongelezenBijlage) {
    redenen.unshift('Er zit een bijlage bij die EVA niet kon lezen — er kan informatie ontbreken.')
    return { status: 'wacht_op_mens', automatisch: false, redenen }
  }

  // ── 5. Is het compleet genoeg om aan te maken? ────────────────────────────
  if (!inv.veldenCompleet) {
    redenen.unshift('Niet alle verplichte velden konden worden ingevuld.')
    return { status: 'wacht_op_mens', automatisch: false, redenen }
  }
  if (!inv.adresBevestigd) {
    redenen.unshift('Het werkadres kon niet worden bevestigd.')
    return { status: 'wacht_op_mens', automatisch: false, redenen }
  }
  for (const veld of ['omschrijving', 'werkadres_straat', 'categorie_voorstel']) {
    if ((inv.vertrouwen[veld] ?? 0) < VELD_BETROUWBAAR) {
      redenen.unshift('EVA is niet zeker genoeg over de ingevulde gegevens.')
      return { status: 'wacht_op_mens', automatisch: false, redenen }
    }
  }

  // ── 6. Bestaat dit al? ────────────────────────────────────────────────────
  if (inv.duplicaatTopscore >= DUPLICAAT_TWIJFEL) {
    redenen.unshift('Dit lijkt op iets dat al is ingeschreven.')
    return { status: 'wacht_op_mens', automatisch: false, redenen }
  }

  // ── 7. Randvoorwaarden ────────────────────────────────────────────────────
  if (inv.dagbudgetOp) {
    redenen.unshift('Het dagbudget voor automatische verwerking is bereikt.')
    return { status: 'wacht_op_mens', automatisch: false, redenen }
  }
  if (!inv.automatischToegestaan) {
    redenen.unshift('Automatisch aanmaken staat uit voor deze postbus.')
    return { status: 'wacht_op_mens', automatisch: false, redenen }
  }

  return {
    status: 'verwerkt',
    automatisch: true,
    redenen: ['Bekende afzender, complete gegevens, bevestigd adres en geen duplicaat gevonden.'],
  }
}

/**
 * Waarom werd dit voorgelegd? Eén zin voor bovenaan het behandelscherm, zodat
 * iemand niet hoeft te raden wat EVA tegenhield.
 */
export function samenvattendeReden(besluit: Besluit): string {
  return besluit.redenen[0] ?? 'Ter controle voorgelegd.'
}
