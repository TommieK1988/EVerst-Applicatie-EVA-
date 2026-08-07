/** Gedeelde types voor de goedkeuringsworkflow (werkbegroting + offerte). */

export type GoedkeuringObjectType = 'werkbegroting' | 'offerte'

export type GoedkeuringStatus = 'aangevraagd' | 'goedgekeurd' | 'afgekeurd' | 'ingetrokken'

/** Rol van de ingelogde gebruiker t.o.v. een goedkeuringsaanvraag. */
export type GoedkeuringRol = 'beoordelaar' | 'meekijker' | 'aanvrager' | 'geen'

/** Iemand die een aanvraag kan beoordelen (zie `beoordelaars.ts`). */
export type BeoordelaarRef = {
  id: string
  naam: string
  /** Zonder auth-koppeling kan de medewerker geen melding of taak ontvangen. */
  authUserId: string | null
}

/** Naar wie gaat een aanvraag op dit dossier? */
export type BeoordelingsRoute = {
  /** Controller van het dossier (null = niet ingesteld, of geen dossier). */
  controller: BeoordelaarRef | null
  /** Actieve directieleden — de keuzelijst als er geen controller is. */
  directie: BeoordelaarRef[]
  /** true = de aanvrager moet zelf een beoordelaar aanwijzen. */
  keuzeNodig: boolean
}

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
  /** Aan wie is de aanvraag gericht: controller van het dossier, of gekozen directielid. */
  beoordelaar_id: string | null
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
  beoordelaar_naam: string | null
  beoordeeld_door_naam: string | null
  gedelegeerd_aan_naam: string | null
  meekijker_namen: string[]
  opmerkingen: GoedkeuringOpmerking[]
  gebeurtenissen: GoedkeuringGebeurtenis[]
}

/** Snapshot-rij: welke regel (met welke inhoud) dekte de laatste goedkeuring. */
export type GoedkeuringRegelSnapshot = {
  regel_id: string
  /** Hash over de volledige regelinhoud — terugval + compatibiliteit met oudere deploys. */
  regel_hash: string
  /** Geaccordeerde kostprijs in centen; de maatstaf voor "moet dit opnieuw langs de controller?". */
  kosten_centen: number | null
}

/**
 * Snapshotrij uit Supabase normaliseren. `kosten_centen` is een bigint en die komt
 * er soms als string uit; zonder deze omzetting zou de bedragvergelijking altijd
 * ongelijk zijn en dus elke geaccordeerde regel als gewijzigd markeren.
 */
export function naarRegelSnapshot(rij: {
  regel_id: string
  regel_hash: string
  kosten_centen: number | string | null
}): GoedkeuringRegelSnapshot {
  return {
    regel_id: rij.regel_id,
    regel_hash: rij.regel_hash,
    kosten_centen: rij.kosten_centen == null ? null : Number(rij.kosten_centen),
  }
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
