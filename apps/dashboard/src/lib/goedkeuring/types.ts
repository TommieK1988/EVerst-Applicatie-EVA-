/** Gedeelde types voor de goedkeuringsworkflow (werkbegroting + offerte). */

export type GoedkeuringObjectType = 'werkbegroting' | 'offerte'

export type GoedkeuringStatus = 'aangevraagd' | 'goedgekeurd' | 'afgekeurd' | 'ingetrokken'

/** Rol van de ingelogde gebruiker t.o.v. een goedkeuringsaanvraag. */
export type GoedkeuringRol = 'beoordelaar' | 'meekijker' | 'aanvrager' | 'geen'

export type Goedkeuring = {
  id: string
  object_type: GoedkeuringObjectType
  object_id: string
  dossier_id: string | null
  ronde: number
  status: GoedkeuringStatus
  object_hash: string | null
  toelichting: string | null
  aangevraagd_door: string | null
  aangevraagd_op: string
  beoordeeld_door: string | null
  beoordeeld_op: string | null
  gedelegeerd_aan: string | null
  meekijkers: string[]
  created_at: string
  updated_at: string
}

export type GoedkeuringOpmerking = {
  id: string
  goedkeuring_id: string
  medewerker_id: string | null
  medewerker_naam: string | null
  tekst: string
  created_at: string
}

export type GoedkeuringGebeurtenis = {
  id: string
  goedkeuring_id: string
  actie: 'aangevraagd' | 'goedgekeurd' | 'afgekeurd' | 'ingetrokken' | 'overgedragen' | 'meekijker_toegevoegd' | 'opmerking'
  medewerker_id: string | null
  medewerker_naam: string | null
  detail: Record<string, unknown>
  created_at: string
}

export type GoedkeuringMetDetails = Goedkeuring & {
  aangevraagd_door_naam: string | null
  beoordeeld_door_naam: string | null
  gedelegeerd_aan_naam: string | null
  meekijker_namen: string[]
  opmerkingen: GoedkeuringOpmerking[]
  gebeurtenissen: GoedkeuringGebeurtenis[]
}

/** Snapshot-rij: welke regel (met welke inhoud) dekte de laatste goedkeuring. */
export type GoedkeuringRegelSnapshot = {
  regel_id: string
  regel_hash: string
}

/** Taken-titels per objecttype ('Werkbegroting controleren' bestond al — niet wijzigen i.v.m. dedup). */
export const BEOORDEEL_TAAK_TITEL: Record<GoedkeuringObjectType, string> = {
  werkbegroting: 'Werkbegroting controleren',
  offerte: 'Offerte controleren',
}

export const AFKEUR_TAAK_TITEL: Record<GoedkeuringObjectType, string> = {
  werkbegroting: 'Werkbegroting aanpassen na afkeuring',
  offerte: 'Offerte aanpassen na afkeuring',
}

/** Afdeling waarvan leden altijd mogen accorderen (vervanging bij afwezigheid controller). */
export const DIRECTIE_AFDELING = 'Directie'
