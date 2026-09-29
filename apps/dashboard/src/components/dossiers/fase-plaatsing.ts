/**
 * Waar een dossier staat, en wat dat in de database en in Bouw7 betekent.
 *
 * Drie bestemmingen:
 *
 *  * **Aanvraag** -- er moet nog geprijsd en geofferteerd worden.
 *  * **Opdracht** -- het werk is gegund; er komt geen offerte (meer) aan te pas.
 *  * **Servicedesk** -- een onderhoudsbon of mutatie. Dit is géén eigen
 *    hoofdstatus: servicedesk wordt in heel EVA afgeleid uit de categorie (zie
 *    `isServicedeskDossier` in ./types en `getDossiersVoorServicedesk`). Daarom
 *    hoort deze plek alleen bij de categorieën Dagelijks onderhoud en Mutatie, en
 *    horen die categorieën omgekeerd altijd hier.
 *
 * (De fase **Offerte** staat hier bewust niet in. Daar kom je via de substatus:
 * `updateDossierSubstatus` verhuist het dossier mee zodra je een substatus uit de
 * offerteladder kiest. Deze tabel gaat over de sprongen die je langs die weg niet
 * kunt maken.)
 *
 * `kolommen` en `bouw7Status` staan er niet voor de sier: ze zijn de bron voor het
 * wegschrijven én voor de terugleescontrole na het aanmaken. Zou het scherm iets
 * anders beloven dan er wordt weggeschreven, dan is dat precies de stille fout waar
 * die controle voor bestaat.
 *
 * Let op de Bouw7-kant. Een verse servicedeskbon gaat naar **LB. Lopende bonnen**.
 * Dáár horen servicedeskbonnen in Bouw7 thuis, en daar blijven ze ook staan: de
 * fasering van een bon -- nieuw, uitgezet, uitgevoerd, financieel gereed -- gebeurt
 * alleen in EVA. Bouw7 kent die ladder niet en hoeft hem niet te volgen.
 *
 * Dat betekent wél dat de lees-sync van de bon af moet blijven. LB vertaalt in
 * BOUW7_NAAR_SERVICEDESK_SUBSTATUS naar `loopt`, dus zonder bescherming zou een
 * verse bon binnen een halve dag van "Nieuw" naar "Onderhanden" springen zonder dat
 * iemand iets deed. Vandaar dat `zetFaseNaAanmaken` de substatus meteen als
 * handmatig markeert -- hetzelfde mechanisme dat een met de hand versleepte bon al
 * beschermde (zie lib/bouw7/handmatige-velden.ts).
 *
 * Twee lezers, één tabel: de mailintake zet er een nieuw dossier mee neer, en de
 * statuskiezer op het dossier verplaatst er een bestaand dossier mee. Zou elk zijn
 * eigen lijstje hebben, dan zou de ene route een dossier ergens neerzetten waar de
 * andere het niet kan vinden.
 *
 * Geen 'use client' en geen 'server-only': dit bestand wordt van beide kanten
 * gelezen en exporteert alleen constanten.
 */

export type DossierFase = 'aanvraag' | 'opdracht' | 'servicedesk'

export interface DossierPlaatsing {
  /** Het woord dat de gebruiker leest. */
  fase: string
  substatus: string
  /** De projectstatus die het Bouw7-project krijgt. */
  bouw7Status: string
  /** Wanneer je dit kiest, in één zin. */
  uitleg: string
  /** Wat er in de dossierkolommen moet staan. */
  kolommen: {
    hoofdstatus: 'aanvraag' | 'opdracht'
    aanvraag_substatus: string | null
    opdracht_substatus: string | null
    servicedesk_substatus: string | null
  }
  /**
   * De opdracht-substatus waaruit de Bouw7-projectstatus wordt afgeleid, of null
   * als het project al goed staat (01. Offerte, wat `maakBouw7Project` zet).
   *
   * Servicedesk gebruikt dit niet: die bon gaat naar een Bouw7-status waar geen
   * EVA-substatus op afbeeldt. Zie `bouw7Prefix`.
   */
  bouw7Via: 'nieuwe_opdracht' | null
  /**
   * De Bouw7-projectstatus rechtstreeks op zijn naam-prefix, voor het geval er geen
   * EVA-substatus is die erop afbeeldt. Alleen servicedesk gebruikt dit.
   */
  bouw7Prefix?: string
}

export const FASE_PLAATSINGEN: Record<DossierFase, DossierPlaatsing> = {
  aanvraag: {
    fase: 'Aanvraag',
    substatus: 'Nieuw',
    bouw7Status: '01. Offerte',
    uitleg: 'Er moet nog geprijsd en geofferteerd worden.',
    kolommen: {
      hoofdstatus: 'aanvraag', aanvraag_substatus: 'nieuw',
      opdracht_substatus: null, servicedesk_substatus: null,
    },
    bouw7Via: null,
  },
  opdracht: {
    fase: 'Opdracht',
    substatus: 'Nieuwe opdracht',
    bouw7Status: '02. Nieuwe opdracht',
    uitleg: 'Het werk is gegund; er komt geen offerte meer aan te pas.',
    kolommen: {
      hoofdstatus: 'opdracht', aanvraag_substatus: null,
      opdracht_substatus: 'nieuwe_opdracht', servicedesk_substatus: null,
    },
    bouw7Via: 'nieuwe_opdracht',
  },
  servicedesk: {
    fase: 'Servicedesk',
    substatus: 'Nieuw',
    bouw7Status: 'LB. Lopende bonnen',
    uitleg: 'Een onderhoudsbon of mutatie; komt op het servicedeskbord.',
    kolommen: {
      // Servicedesk draait op een eigen ladder náást de aanvraagfase; zo staan alle
      // bestaande servicedeskdossiers in de database ook.
      hoofdstatus: 'aanvraag', aanvraag_substatus: 'nieuw',
      opdracht_substatus: null, servicedesk_substatus: 'nieuw',
    },
    bouw7Via: null,
    bouw7Prefix: 'LB.',
  },
}

/**
 * De twee categorieën waaraan heel EVA een servicedeskdossier herkent.
 *
 * Hoofdlettergevoelig, want `isServicedeskDossier` en `getDossiersVoorServicedesk`
 * vergelijken op exact deze namen.
 */
export const SERVICEDESK_CATEGORIEEN = ['Dagelijks onderhoud', 'Mutatie']

/** Hoort deze categorie bij de servicedesk? */
export function isServicedeskCategorie(naam: string | null | undefined): boolean {
  return SERVICEDESK_CATEGORIEEN.includes((naam ?? '').trim())
}

/** In welke fase staat dit dossier nu? Null voor een offerte: die hoort hier niet. */
export function faseVanDossier(d: {
  hoofdstatus: string | null
  servicedesk_substatus?: string | null
}): DossierFase | null {
  if (d.servicedesk_substatus) return 'servicedesk'
  if (d.hoofdstatus === 'opdracht') return 'opdracht'
  if (d.hoofdstatus === 'aanvraag') return 'aanvraag'
  return null
}

/**
 * Wat er níet meekomt bij een verplaatsing naar de opdrachtfase.
 *
 * De gewone weg naar een opdracht is een offerte op Gewonnen; die trekt
 * `neemWerkbegrotingOverStil` en `stuurAanneemsomNaarBouw7Intern` mee en maakt het
 * termijnschema. Een handmatige verplaatsing doet daar niets van -- hij corrigeert
 * waar het dossier staat, meer niet. Dat hoort in de bevestiging te staan, anders
 * denkt iemand dat hij de hele stap heeft gezet.
 */
export const GEVOLGEN_BIJ_OPDRACHT = [
  'De werkbegroting wordt niet overgenomen als planningsbudget.',
  'Er gaat geen aanneemsom naar Bouw7.',
  'Er wordt geen termijnschema aangemaakt.',
]

/**
 * De fase die bij een binnengekomen bericht past.
 *
 * Volgorde is de rangorde: de categorie wint van de mailsoort, want servicedesk
 * wordt in heel EVA uit de categorie afgeleid en de Bouw7-sync dwingt dat elke
 * ronde terug. Daarna telt de soort mee -- een bon zonder offerte vooraf hoort
 * meteen in de opdrachtfase en niet als aanvraag die nog geprijsd moet worden.
 *
 * Staat hier en niet bij het behandelscherm, omdat de automatische route hem ook
 * nodig heeft. Toen deze regel alleen in een `'use client'`-bestand stond, viel
 * elk automatisch aangemaakt dossier terug op "aanvraag" -- en dat was precies de
 * reden dat een opdrachtbon nooit ongezien ingeschreven mocht worden.
 */
export function faseVoorstelVoor(
  categorieNaam: string | null,
  mailSoort: string | null,
): DossierFase {
  if (isServicedeskCategorie(categorieNaam)) return 'servicedesk'
  if (mailSoort === 'servicedeskbon') return 'servicedesk'
  if (mailSoort === 'opdrachtbon') return 'opdracht'
  return 'aanvraag'
}
