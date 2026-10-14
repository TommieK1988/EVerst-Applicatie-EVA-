/**
 * Types voor de verzamelfactuur — gedeeld door server en scherm.
 *
 * Een verzamelfactuur bundelt servicedeskbonnen op Kosten compleet van één factuurpartij binnen
 * één werkmaatschappij. De regels per bon worden niet hier samengesteld maar in de bon zelf
 * (Verkoop-tab): wie iets wil aanpassen, doet dat daar. Dit scherm toont en zet klaar.
 */

export type Werkmaatschappij = { id: string; naam: string; bouw7BranchId: number }

export type KandidaatDossier = {
  id: string
  dossiernummer: string | null
  titel: string | null
  referentie: string | null
  opdrachtgever: string | null
  /** Staat al op een verzamelfactuur die nog als concept in Bouw7 klaarstaat. */
  opConcept: { verzamelfactuurId: string; bouw7InvoiceId: string | null } | null
}

export type Factuurpartij = {
  bouw7ContactId: string
  naam: string
  /** De bonnen staan op naam van een beheerder; deze partij betaalt via het factuuradres. */
  viaFactuuradres: boolean
  dossiers: KandidaatDossier[]
}

export type VoorbeeldRegel = {
  omschrijving: string
  aantal: number
  eenheid: string | null
  stukprijs: number
  bedrag: number
  btwLabel: string
  btwPct: number
  soort: 'regie' | 'termijn'
}

export type VoorbeeldDossier = {
  id: string
  /** Kop van het hoofdstuk op de factuur: projectnummer + naam, zoals Bouw7 het schrijft. */
  kop: string
  referentie: string | null
  regels: VoorbeeldRegel[]
  totaal: number
  /** Wat de gebruiker moet weten maar niets tegenhoudt (bv. boekingen zonder bewakingscode). */
  waarschuwingen: string[]
  /** Waarom deze bon niet mee kan; leeg = hij kan mee. */
  blokkade: string | null
  /** Er staat op deze bon niets meer open; hij gaat niet mee op de factuur. */
  leeg: boolean
}

export type BtwGroep = { label: string; pct: number; grondslag: number; btw: number }

export type VerzamelVoorbeeld = {
  factuurpartij: { bouw7ContactId: string; naam: string; btwVerlegd: boolean }
  werkmaatschappij: string
  dossiers: VoorbeeldDossier[]
  /** Gekozen bonnen waarop niets meer open staat; die gaan niet mee. */
  leeg: VoorbeeldDossier[]
  btwGroepen: BtwGroep[]
  totaalExcl: number
  totaalBtw: number
  totaalIncl: number
}

export type VerzamelfactuurRij = {
  id: string
  factuurpartijNaam: string
  werkmaatschappij: string | null
  status: 'concept' | 'verzonden' | 'verwijderd'
  bouw7InvoiceId: string | null
  factuurnummer: string | null
  totaalExcl: number | null
  aantalDossiers: number
  aangemaaktOp: string
  aangemaaktDoor: string | null
}
