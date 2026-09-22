/**
 * mailintake/beslis.ts
 *
 * Wat gebeurt er met dit bericht? Één functie, zonder database en zonder
 * netwerk, zodat de regel na te lezen én na te rekenen is.
 *
 * DRIE VRAGEN, IN DEZE VOLGORDE
 *  1. **Wat is dit?** Een aanvraag (A), een opdracht (B), of overige post (C).
 *     C is een uitgang: die hoort niet in het postvak thuis en wordt niet
 *     voorgelegd -- de mail blijft in Postvak IN en de mailboxbeheerder doet de
 *     rest.
 *  2. **Wat staat er in de weg?** Alle bezwaren voor de gekozen route, niet
 *     alleen de eerste.
 *  3. **Mag EVA het zelf?** Alleen als er geen enkel bezwaar is.
 *
 * WAAROM ALLE BEZWAREN EN NIET DE EERSTE
 * Dit bestand stopte bij het eerste bezwaar en stuurde het bericht meteen naar
 * een mens. Twee dingen gingen daardoor mis. Het scherm veranderde per bericht,
 * want welk paneel je kreeg hing af van welke rem toevallig als eerste afging.
 * En de behandelaar kreeg een half formulier, want de controles daarná waren
 * niet eens gedaan -- wat eruitziet als een onvolledige aanvraag terwijl EVA
 * gewoon te vroeg stopte.
 *
 * Nu wordt alles nagelopen en verzamelen we de bezwaren. Bij voorleggen staat er
 * een volledig ingevuld formulier met daarboven precies wat er nog aan mankeert.
 *
 * De belofte blijft: **bij twijfel voorleggen**. Automatisch handelen is de
 * uitzondering die aan álle voorwaarden voldoet; één bezwaar is genoeg om het
 * tegen te houden.
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
  /** De opdracht wordt op nacalculatie afgerekend; er hoort geen offerte bij. */
  regie: boolean
  /**
   * Eén enkele offertetreffer die zó sterk is dat er niets te kiezen valt: ons
   * nummer staat letterlijk in de mail, het is dezelfde conversatie, of dezelfde
   * bijlage. Alleen dán mag de statuswissel zonder mens.
   */
  offerteMatchHard: boolean
  meerdereWerkadressen: boolean
  /** Er zat een bijlage bij die niet gelezen kon worden. */
  ongelezenBijlage: boolean
  dagbudgetOp: boolean
  /** Heeft Bouw7 alles wat het nodig heeft? Zie bouw7-gereed.ts. */
  bouw7Gereed: boolean
  /** Wat er aan de Bouw7-kant mist; komt één op één in de bezwaren terecht. */
  bouw7Ontbreekt: string[]
  /**
   * Een mens heeft dit bericht uit de bak "geen aanvraag" gehaald en gezegd dat
   * het wél werk is. Dan mag EVA het niet opnieuw als ruis wegzetten, hoe onzeker
   * het model ook is -- die beoordeling is al gedaan, en door iemand die meer weet.
   */
  mensZegtWerk?: boolean
}

export interface Besluit {
  status: BerichtStatus
  /** Wat er met dit bericht zou moeten gebeuren, ongeacht wie het doet. */
  route: IntakeRoute
  /** true = EVA mag die route zelf lopen. */
  automatisch: boolean
  /**
   * Alles wat er aan mankeert, in gewone taal. Leeg = niets in de weg.
   * Bij `automatisch: false` is dit de lijst die boven het formulier komt.
   */
  redenen: string[]
}

/**
 * Bepaalt de uitkomst.
 *
 * Eerst classificeren, dan verzamelen, dan pas beslissen. De classificatie is de
 * enige plek waar nog vroeg wordt uitgestapt, en alleen naar buiten: overige post
 * hoort niet in het postvak.
 */
export function beslis(inv: BeslisInvoer): Besluit {
  // ── 1. Wat is dit? ─────────────────────────────────────────
  const buiten = (reden: string): Besluit =>
    ({ status: 'geen_aanvraag', route: 'geen', automatisch: false, redenen: [reden] })

  // Een mens die dit uit de archiefbak heeft gehaald heeft al gezegd dat het werk
  // is. Dan mag het niet opnieuw naar buiten, ook niet als het model er anders
  // over denkt -- anders zet EVA de correctie meteen weer terug.
  const magNaarBuiten = !inv.mensZegtWerk

  if (inv.soort == null) {
    return inv.mensZegtWerk
      ? { status: 'wacht_op_mens', route: 'nieuw_dossier', automatisch: false,
          redenen: ['EVA kon nog steeds niet bepalen wat voor bericht dit is.'] }
      : buiten('EVA kon niet bepalen wat voor bericht dit is.')
  }

  const isWerk = WERK_SOORTEN.includes(inv.soort)

  // C — overige post. Correspondentie, aanvullende informatie, facturen en ruis
  // horen in de mailbox, niet in EVA. Ze blijven ongelezen in Postvak IN staan en
  // komen in het archief terecht; van daaruit kan een mens ze alsnog naar Te
  // behandelen halen, en dan komt `mensZegtWerk` binnen.
  if (!isWerk && magNaarBuiten) {
    return buiten(`Beoordeeld als "${inv.soort}"; hoort in de mailbox, niet in EVA.`)
  }
  if (inv.soort === 'aanvullende_informatie' && magNaarBuiten) {
    return buiten('Dit hoort bij een traject dat al loopt; af te handelen in de mailbox.')
  }

  const route = bepaalRoute(inv.soort, inv.offerteMatchGevonden, inv.regie)

  // ── 2. Wat staat er in de weg? ────────────────────────────────
  // Alles nalopen, niets overslaan. Elk bezwaar is een regel die de behandelaar
  // boven zijn formulier krijgt; samen vormen ze de reden dat hij ernaar kijkt.
  const bezwaren: string[] = []

  if (inv.soortVertrouwen < SOORT_ZEKER) {
    bezwaren.push(inv.soortVertrouwen < SOORT_ONZEKER
      ? `EVA is onzeker over wat voor bericht dit is (${Math.round(inv.soortVertrouwen * 100)}%).`
      : `EVA denkt aan "${inv.soort}", maar niet zeker genoeg om zelf te handelen.`)
  }

  // Meerwerk raakt een lopende opdracht en kent geen eigen automatische route.
  if (route === 'geen') {
    bezwaren.push('Dit lijkt meerwerk op een lopende opdracht; wijs het juiste dossier aan.')
  }

  if (inv.afzenderScore < AFZENDER_AUTOMATISCH) {
    bezwaren.push(inv.afzenderScore <= 0
      ? 'De afzender is niet herkend als bestaande klant.'
      : 'De afzender is niet zeker genoeg herkend.')
  } else if (inv.aantalRelatieKandidaten !== 1) {
    // Alleen zinvol als de afzender wél is herkend; anders staat er twee keer
    // hetzelfde bezwaar over dezelfde opdrachtgever.
    bezwaren.push(`Er zijn ${inv.aantalRelatieKandidaten} mogelijke opdrachtgevers — kies de juiste.`)
  }

  if (inv.meerdereWerkadressen) {
    bezwaren.push('De mail betreft werk op meerdere adressen; dat wordt niet één dossier.')
  }
  if (inv.ongelezenBijlage) {
    bezwaren.push('Er zit een bijlage bij die EVA niet kon lezen — er kan informatie ontbreken.')
  }

  // ── Per route ────────────────────────────────────────────
  if (route === 'offerte_winnen') {
    // Dit verandert een dossier dat al loopt, met gevolgen tot in Bouw7: de
    // projectstatus schuift op, de werkbegroting wordt overgenomen en de
    // aanneemsom gaat de deur uit. Er is geen weg terug, dus de lat ligt hoog.
    if (!inv.offerteMatchGevonden) {
      bezwaren.push('Er is geen offerte gevonden die hierbij hoort — wijs zelf het juiste dossier aan.')
    } else if (!inv.offerteMatchHard) {
      bezwaren.push('Er past wel een offerte bij, maar niet onmiskenbaar genoeg om die zelf op gewonnen te zetten.')
    }
  } else {
    if (!AUTOMATISCH_TOEGESTANE_SOORTEN.includes(inv.soort)) {
      bezwaren.push('Deze soort wordt nooit ongezien ingeschreven.')
    }
    if (!inv.veldenCompleet) bezwaren.push('Niet alle verplichte velden konden worden ingevuld.')
    if (!inv.adresBevestigd) bezwaren.push('Het werkadres kon niet worden bevestigd.')
    for (const veld of ['omschrijving', 'werkadres_straat', 'categorie_voorstel']) {
      if ((inv.vertrouwen[veld] ?? 0) < VELD_BETROUWBAAR) {
        bezwaren.push('EVA is niet zeker genoeg over de ingevulde gegevens.')
        break
      }
    }
    // Zonder deze controle maakt Bouw7 het project gewoon aan, maar zonder klant
    // of met een projectnummer uit de verkeerde reeks. Dat gaat niet stuk, het
    // gaat stil fout -- en dat is erger. Alles wat er mist komt mee, want het is
    // precies de lijst die de behandelaar moet afwerken.
    if (!inv.bouw7Gereed) {
      bezwaren.push(...(inv.bouw7Ontbreekt.length
        ? inv.bouw7Ontbreekt
        : ['Het Bouw7-project kan nog niet correct worden aangemaakt.']))
    }
    if (inv.duplicaatTopscore >= DUPLICAAT_TWIJFEL) {
      bezwaren.push('Dit lijkt op iets dat al is ingeschreven.')
    }
  }

  // ── 3. Mag EVA het zelf? ───────────────────────────────────
  // Deze twee staan apart van de bezwaren hierboven: ze zeggen niets over het
  // bericht. Een bericht dat verder helemaal klopt hoort niet als "er mankeert
  // iets aan" op het scherm te komen omdat de postbus op handmatig staat.
  const magNiet: string[] = []
  if (inv.dagbudgetOp) magNiet.push('Het dagbudget voor automatische verwerking is bereikt.')
  if (!inv.automatischToegestaan) magNiet.push('Automatisch aanmaken staat uit voor deze postbus.')

  if (bezwaren.length === 0 && magNiet.length === 0) {
    return {
      status: 'verwerkt',
      route,
      automatisch: true,
      redenen: route === 'offerte_winnen'
        ? ['Onmiskenbaar akkoord op één bekende offerte van ons.']
        : ['Bekende klant, alle gegevens compleet en niets dat erop lijkt.'],
    }
  }

  return {
    status: 'wacht_op_mens',
    route,
    automatisch: false,
    redenen: [...bezwaren, ...magNiet],
  }
}

/**
 * Eén regel voor in het logboek en het postvak.
 *
 * Bij voorleggen het eerste bezwaar met het aantal erbij: de lijst kan nu lang
 * zijn, en een kolom in een overzicht heeft één zin nodig, geen alinea. De
 * volledige lijst staat op het behandelscherm.
 */
export function samenvattendeReden(besluit: Besluit): string {
  const eerste = besluit.redenen[0] ?? 'Geen reden vastgelegd.'
  if (besluit.automatisch || besluit.redenen.length <= 1) return eerste
  return `${eerste} (+${besluit.redenen.length - 1} meer)`
}
