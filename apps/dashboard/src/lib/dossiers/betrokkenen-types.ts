/**
 * Vormen voor het blok Betrokkenen op het Informatie-tabblad.
 *
 * Los van de server actions: een `'use server'`-bestand mag alleen async functies exporteren.
 */

/** Waar komt deze regel vandaan? Bepaalt of hij te verwijderen is. */
export type BetrokkeneHerkomst = 'opdrachtgever' | 'factuuradres' | 'handmatig'

export const HERKOMST_LABEL: Record<BetrokkeneHerkomst, string> = {
  opdrachtgever: 'Contactpersoon opdrachtgever',
  factuuradres: 'Via factuuradres',
  handmatig: 'Toegevoegd',
}

/**
 * Eén betrokkene zoals het scherm hem toont — samengevoegd uit drie bronnen, dus niet één
 * databaserij. Alleen `herkomst: 'handmatig'` heeft een `id` en is te wijzigen of te verwijderen.
 */
export type Betrokkene = {
  /** Stabiele React-sleutel; voor afgeleide regels samengesteld uit bron + id. */
  sleutel: string
  herkomst: BetrokkeneHerkomst
  /** Alleen gevuld bij `handmatig`: de rij in `dossier_betrokkenen`. */
  id: string | null
  /** Naam van de persoon, of van de organisatie als er geen persoon bij staat. */
  naam: string
  rol: string | null
  contactpersoon_id: string | null
  organisatie: { id: string; naam: string } | null
  email: string | null
  telefoon: string | null
  opmerkingen: string | null
}
