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
 * Let op de Bouw7-kant. Een verse servicedeskbon gaat naar **02. Nieuwe opdracht**,
 * niet naar 01. Offerte: de lees-sync vertaalt 01 voor een servicedeskcategorie naar
 * substatus `offerte_uitgebracht` (zie BOUW7_NAAR_SERVICEDESK_SUBSTATUS), en dan
 * staat een bon waar nooit een offerte voor is gemaakt op het bord onder "Offerte
 * uitgebracht". Op 02 leidt dezelfde tabel 'nieuw' af. Zo landt een dossier waar de
 * sync het toch al zou neerzetten -- er komt geen nieuwe regel bij.
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
   */
  bouw7Via: 'nieuwe_opdracht' | null
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
    bouw7Status: '02. Nieuwe opdracht',
    uitleg: 'Een onderhoudsbon of mutatie; komt op het servicedeskbord.',
    kolommen: {
      // Servicedesk draait op een eigen ladder náást de aanvraagfase; zo staan alle
      // bestaande servicedeskdossiers in de database ook.
      hoofdstatus: 'aanvraag', aanvraag_substatus: 'nieuw',
      opdracht_substatus: null, servicedesk_substatus: 'nieuw',
    },
    bouw7Via: 'nieuwe_opdracht',
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
