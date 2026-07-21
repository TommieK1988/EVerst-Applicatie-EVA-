/**
 * Gedeelde VCA-typen en labels.
 *
 * Bewust GEEN 'use server'-bestand: daaruit mag Next alleen async functies
 * exporteren, dus constanten als de labelmap horen hier thuis en worden zowel
 * door de serveracties als door de client-componenten geïmporteerd.
 */

export type VcaSoort = 'b_vca' | 'vol_vca' | 'vil_vca'

export const VCA_SOORT_LABEL: Record<VcaSoort, string> = {
  b_vca: 'B-VCA (Basisveiligheid)',
  vol_vca: 'VOL-VCA (Leidinggevenden)',
  vil_vca: 'VIL-VCA (Intercedenten)',
}

/** Rood/oranje/groen o.b.v. geldig_tot. `onbekend` = geen einddatum vastgelegd. */
export type VcaStatus = 'geldig' | 'verloopt_binnenkort' | 'verlopen' | 'geen' | 'onbekend'

/** Verloopt binnen dit aantal dagen ⇒ oranje. */
export const WAARSCHUWING_DAGEN = 90

export type VcaRij = {
  medewerker_id: string
  naam: string
  functie: string | null
  afdeling: string | null
  diploma_id: string | null
  soort: VcaSoort | null
  diplomanummer: string | null
  behaald_op: string | null
  geldig_tot: string | null
  status: VcaStatus
  dagen_tot_verval: number | null
}

/** Bepaal de statuskleur van een diploma; gedeeld zodat server en UI niet uiteenlopen. */
export function bepaalVcaStatus(
  geldigTot: string | null,
  heeftDiploma: boolean,
): { status: VcaStatus; dagen: number | null } {
  if (!heeftDiploma) return { status: 'geen', dagen: null }
  if (!geldigTot) return { status: 'onbekend', dagen: null }
  const vandaag = new Date()
  vandaag.setHours(0, 0, 0, 0)
  const eind = new Date(`${geldigTot}T00:00:00`)
  const dagen = Math.round((eind.getTime() - vandaag.getTime()) / 86_400_000)
  if (dagen < 0) return { status: 'verlopen', dagen }
  if (dagen <= WAARSCHUWING_DAGEN) return { status: 'verloopt_binnenkort', dagen }
  return { status: 'geldig', dagen }
}
