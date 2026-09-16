/**
 * mailintake/beslis.ts
 *
 * Wat gebeurt er met dit bericht? Eén functie, zonder database en zonder
 * netwerk, zodat de regel na te lezen én na te rekenen is.
 *
 * Twee vragen, en die zijn niet hetzelfde:
 *  - **Welke route?** Wordt dit een nieuw dossier, of gaat er een bestaande
 *    offerte op gewonnen? Dat volgt uit de soort en uit de vraag of we een
 *    bijpassende offerte hebben gevonden.
 *  - **Mag EVA die route zelf lopen?** Dat is de rem, en die staat standaard dicht.
 *
 * De belofte die dit bestand waarmaakt: **bij twijfel voorleggen**. Automatisch
 * handelen is de uitzondering die aan álle voorwaarden voldoet. Er is geen enkel
 * pad waarin onzekerheid tot een automatische handeling leidt — zie `redenen`,
 * die precies vertelt welke voorwaarde de doorslag gaf.
 *
 * Let op de asymmetrie bij de soort: twijfel over "dit is werk" en twijfel over
 * "dit is geen werk" leiden allebei naar een mens. Dat is geen slordigheid maar
 * de kern: een gemiste aanvraag is duurder dan een overbodige klik.
 */

import {
  AFZENDER_AUTOMATISCH, SOORT_ZEKER, SOORT_ONZEKER, DUPLICAAT_TWIJFEL,
  VELD_BETROUWBAAR, AUTOMATISCH_TOEGESTANE_SOORTEN, WERK_SOORTEN, bepaalRoute,
  type BerichtStatus, type MailSoort, type IntakeRoute,
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
  /** Is er een dossier in de offertefase gevonden dat hierbij hoort? */
  offerteMatchGevonden: boolean
  /**
   * Eén enkele offertetreffer die zó sterk is dat er niets te kiezen valt: ons
   * nummer staat letterlijk in de mail, het is dezelfde conversatie, of dezelfde
   * bijlage. Alleen dán mag de statuswissel zonder mens.
   */
  offerteMatchHard: boolean
  isAntwoord: boolean
  meerdereWerkadressen: boolean
  /** Er zat een bijlage bij die niet gelezen kon worden. */
  ongelezenBijlage: boolean
  dagbudgetOp: boolean
  /** Heeft Bouw7 alles wat het nodig heeft? Zie bouw7-gereed.ts. */
  bouw7Gereed: boolean
  /** Wat er aan de Bouw7-kant mist; de eerste regel wordt de reden. */
  bouw7Ontbreekt: string[]
}

export interface Besluit {
  status: BerichtStatus
  /** Wat er met dit bericht zou moeten gebeuren, ongeacht wie het doet. */
  route: IntakeRoute
  /** true = EVA mag die route zelf lopen. */
  automatisch: boolean
  /** Leesbare redenen; de eerste is de doorslaggevende. */
  redenen: string[]
}

/**
 * Bepaalt de uitkomst. De volgorde van de controles is de volgorde waarin een
 * mens ze zou stellen: is dit werk, wat moet ermee gebeuren, kennen we de
 * afzender, is het compleet, bestaat het al.
 */
export function beslis(inv: BeslisInvoer): Besluit {
  const redenen: string[] = []
  const stop = (status: BerichtStatus, route: IntakeRoute, reden: string): Besluit => {
    redenen.unshift(reden)
    return { status, route, automatisch: false, redenen }
  }

  // ── 1. Is dit überhaupt werk? ─────────────────────────────────────────────
  if (inv.soort == null) {
    return stop('wacht_op_mens', 'geen', 'EVA kon niet bepalen wat voor bericht dit is.')
  }

  // Hoort bij een lopend traject: geen nieuw dossier, maar zeker niet parkeren.
  // Iemand moet de bijlagen aan het juiste dossier hangen.
  if (inv.soort === 'aanvullende_informatie') {
    return stop('wacht_op_mens', 'geen',
      'Dit hoort bij een traject dat al loopt — koppel het aan het juiste dossier.')
  }

  const isWerk = WERK_SOORTEN.includes(inv.soort)

  if (!isWerk) {
    // Alleen bij hoge zekerheid parkeren we het als "geen aanvraag". Twijfelt het
    // model, dan kijkt er een mens naar — want dit is de fout die niemand ziet.
    if (inv.soortVertrouwen >= SOORT_ZEKER) {
      return stop('geen_aanvraag', 'geen',
        `Beoordeeld als "${inv.soort}" met hoge zekerheid; geen aanvraag of opdracht.`)
    }
    return stop('wacht_op_mens', 'geen',
      `Lijkt geen aanvraag, maar EVA twijfelt (${Math.round(inv.soortVertrouwen * 100)}%) — controleer dit zelf.`)
  }

  // Vanaf hier: het lijkt werk. Alle onderstaande controles kunnen alleen nog
  // maar remmen, nooit versnellen.
  //
  // Let op de `return` hieronder. Zonder die return zou twijfel over de soort
  // alleen een regel tekst opleveren en zou het bericht daarna gewoon de
  // automatische route in lopen — het tegenovergestelde van wat deze module
  // belooft. Dat is precies de fout die de toets in scratch/toets-beslis eruit haalde.
  if (inv.soortVertrouwen < SOORT_ZEKER) {
    return stop('wacht_op_mens', 'geen',
      inv.soortVertrouwen < SOORT_ONZEKER
        ? `EVA is onzeker over wat voor bericht dit is (${Math.round(inv.soortVertrouwen * 100)}%).`
        : `EVA denkt aan "${inv.soort}", maar niet zeker genoeg om zelf te handelen.`)
  }

  const route = bepaalRoute(inv.soort, inv.offerteMatchGevonden)

  // Meerwerk raakt een lopende opdracht en kent geen eigen route: altijd een mens.
  if (route === 'geen') {
    return stop('wacht_op_mens', 'geen', 'Dit lijkt meerwerk op een lopende opdracht.')
  }

  // ── 2. Remmen die voor beide routes gelden ────────────────────────────────
  if (inv.afzenderScore < AFZENDER_AUTOMATISCH) {
    return stop('wacht_op_mens', route,
      inv.afzenderScore <= 0
        ? 'De afzender is niet herkend als bestaande klant.'
        : 'De afzender is niet zeker genoeg herkend.')
  }
  if (inv.aantalRelatieKandidaten !== 1) {
    return stop('wacht_op_mens', route,
      `Er zijn ${inv.aantalRelatieKandidaten} mogelijke opdrachtgevers — kies de juiste.`)
  }
  if (inv.meerdereWerkadressen) {
    return stop('wacht_op_mens', route,
      'De mail betreft werk op meerdere adressen; dat wordt niet één dossier.')
  }
  if (inv.ongelezenBijlage) {
    return stop('wacht_op_mens', route,
      'Er zit een bijlage bij die EVA niet kon lezen — er kan informatie ontbreken.')
  }
  if (inv.dagbudgetOp) {
    return stop('wacht_op_mens', route, 'Het dagbudget voor automatische verwerking is bereikt.')
  }
  if (!inv.automatischToegestaan) {
    return stop('wacht_op_mens', route, 'Automatisch aanmaken staat uit voor deze postbus.')
  }

  // ── 3a. Route "offerte winnen" ────────────────────────────────────────────
  // Dit verandert een dossier dat al loopt, met gevolgen tot in Bouw7: de
  // projectstatus schuift op, de werkbegroting wordt overgenomen en de aanneemsom
  // gaat de deur uit. Er is geen weg terug, dus de lat ligt hoog.
  if (route === 'offerte_winnen') {
    if (!inv.offerteMatchGevonden) {
      return stop('wacht_op_mens', route,
        'Er is geen offerte gevonden die hierbij hoort — wijs zelf het juiste dossier aan.')
    }
    if (!inv.offerteMatchHard) {
      return stop('wacht_op_mens', route,
        'Er past wel een offerte bij, maar niet onmiskenbaar genoeg om die zelf op gewonnen te zetten.')
    }
    // Dat dit een antwoord in een lopend gesprek is, is hier juist normaal: een
    // akkoord komt vrijwel altijd als reply op onze eigen offertemail. Die rem
    // geldt dus alleen voor de route hieronder.
    return {
      status: 'verwerkt',
      route,
      automatisch: true,
      redenen: ['Onmiskenbaar akkoord op één bekende offerte van ons.'],
    }
  }

  // ── 3b. Route "nieuw dossier" ─────────────────────────────────────────────
  if (!AUTOMATISCH_TOEGESTANE_SOORTEN.includes(inv.soort)) {
    return stop('wacht_op_mens', route, 'Deze soort wordt nooit ongezien ingeschreven.')
  }
  if (inv.isAntwoord) {
    return stop('wacht_op_mens', route,
      'Dit is een antwoord in een lopend gesprek; dat hoort bijna altijd bij iets dat al bestaat.')
  }
  if (!inv.veldenCompleet) {
    return stop('wacht_op_mens', route, 'Niet alle verplichte velden konden worden ingevuld.')
  }
  if (!inv.adresBevestigd) {
    return stop('wacht_op_mens', route, 'Het werkadres kon niet worden bevestigd.')
  }
  for (const veld of ['omschrijving', 'werkadres_straat', 'categorie_voorstel']) {
    if ((inv.vertrouwen[veld] ?? 0) < VELD_BETROUWBAAR) {
      return stop('wacht_op_mens', route, 'EVA is niet zeker genoeg over de ingevulde gegevens.')
    }
  }

  // Zonder deze controle maakt Bouw7 het project gewoon aan, maar zonder klant of
  // met een projectnummer uit de verkeerde reeks. Dat gaat niet stuk, het gaat
  // stil fout — en dat is erger.
  if (!inv.bouw7Gereed) {
    return stop('wacht_op_mens', route,
      inv.bouw7Ontbreekt[0] ?? 'Het Bouw7-project kan nog niet correct worden aangemaakt.')
  }

  if (inv.duplicaatTopscore >= DUPLICAAT_TWIJFEL) {
    return stop('wacht_op_mens', route, 'Dit lijkt op iets dat al is ingeschreven.')
  }

  return {
    status: 'verwerkt',
    route,
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
