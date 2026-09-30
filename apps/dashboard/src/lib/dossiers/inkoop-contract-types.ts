/**
 * Types voor het openen van een inkooporder of OA-contract op het Inkoop-tab. Los van
 * `inkoop-contract-actions.ts`: dat is een 'use server'-module en die exporteert alleen async functies.
 */

export type InkoopContractSoort = 'inkooporder' | 'oa_contract'

/** Eén besteld/opgedragen onderdeel: een bestelregel, of een termijn zonder bestelregels. */
export type InkoopContractRegel = {
  omschrijving: string
  aantal: number | null
  eenheid: string | null
  stukprijs: number | null
  bedrag: number | null
  code: string | null
}

export type InkoopContractTermijn = {
  omschrijving: string
  bedrag: number | null
  regels: InkoopContractRegel[]
}

export type InkoopContractDetail = {
  soort: InkoopContractSoort
  contractId: number
  nummer: string | null
  naam: string | null
  omschrijving: string | null
  partij: string | null
  partijEmail: string | null
  partijTelefoon: string | null
  bedrag: number | null
  startdatum: string | null
  opleverdatum: string | null
  betaalafspraak: string | null
  termijnen: InkoopContractTermijn[]
  /** Leverbonnen met al een inkoopfactuur: dan kan intrekken niet vanuit EVA. */
  geboekteBonnen: string[]
  /** Bestaat er een EVA-bestelling bij (aangemaakt vanuit de werkbegroting)? */
  uitEva: boolean
  /** De EVA-bestelling achter het contract; daarmee kan hij vanuit het venster worden verstuurd. */
  bestellingId: string | null
  /** Een reservering gaat nooit naar de partij: die is al vastgelegd en afgeroepen. */
  isReservering: boolean
  sjabloonId: string | null
  verstuurdOp: string | null
  verstuurdNaar: string | null
  /** Link naar het verstuurde document (SharePoint), als dat is gearchiveerd. */
  documentUrl: string | null
}
