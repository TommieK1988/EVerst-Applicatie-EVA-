/**
 * Gedeelde constanten voor objectenbeheer — importeerbaar vanuit client-componenten
 * (geen 'use server', geen admin-client).
 */

import type { VastgoedObject } from '@everts/database'

/** Object zoals het op de relatiepagina getoond wordt. */
export type RelatieObject = {
  id: string
  naam: string
  objectnummer: string
  adres: string
  /** Rollabels van deze relatie bij dit object ("Beheerder", "VvE"). */
  rollen: string[]
  aantalDossiers: number
}

/**
 * Velden die Bouw7 beheert. Zodra een object daar bestaat
 * (`bouw7_property_asset_id` gevuld) zijn ze in EVA read-only: de sync overschrijft
 * ze anders bij de eerstvolgende run en dan lijkt EVA gegevens te "vergeten".
 * Wijzigen doe je in Bouw7 — of via het EVA-formulier, dat ze doorschrijft.
 */
export const BOUW7_BEHEERDE_VELDEN = [
  'objectnummer', 'naam', 'adres_straat', 'adres_huisnummer',
  'adres_postcode', 'adres_plaats', 'omschrijving', 'standaard_opdrachtgever_id',
] as const

/** Staat dit object onder beheer van Bouw7? */
export function isUitBouw7(object: Pick<VastgoedObject, 'bouw7_property_asset_id'>): boolean {
  return object.bouw7_property_asset_id != null
}

/** Statuslabel voor de Bouw7-koppeling van een object. */
export function bouw7StatusLabel(
  object: Pick<VastgoedObject, 'bouw7_property_asset_id' | 'bouw7_sync_status'>,
): { label: string; toon: 'ok' | 'wacht' | 'fout' } {
  if (object.bouw7_sync_status === 'error') return { label: 'Fout bij Bouw7', toon: 'fout' }
  if (object.bouw7_property_asset_id != null) return { label: 'In Bouw7', toon: 'ok' }
  return { label: 'Nog niet in Bouw7', toon: 'wacht' }
}
