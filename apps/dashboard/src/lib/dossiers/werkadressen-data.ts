import 'server-only'
import { createAdminClient } from '@everts/database/server'
import { haalAlleRijen } from '@/lib/supabase/paginate'
import type { ExtraWerkadresVelden } from './werkpunten'

/**
 * Lezen van de extra werkadressen voor de server-kant (prikklok, openen op locatie). Admin-client:
 * de aanroepers hebben de toegang al bepaald.
 */

export type ExtraWerkadresRij = ExtraWerkadresVelden & {
  dossier_id: string
  volgorde: number
  contact_naam: string | null
  contact_telefoon: string | null
  geocode_status: string | null
}

export const WERKADRES_SELECT =
  'id, dossier_id, volgorde, naam, straat, huisnummer, postcode, stad, contact_naam, contact_telefoon, lat, lng, geocode_status'

const db = () => createAdminClient()

/** Extra werkadressen per dossier-id (gepagineerd: de lijst ids kan lang zijn). */
export async function extraWerkadressenVan(dossierIds: string[]): Promise<Map<string, ExtraWerkadresRij[]>> {
  const uit = new Map<string, ExtraWerkadresRij[]>()
  const ids = [...new Set(dossierIds)].filter(Boolean)
  // In blokken van 200: een lange `in (...)` loopt anders tegen de URL-lengte aan.
  for (let i = 0; i < ids.length; i += 200) {
    const blok = ids.slice(i, i + 200)
    const rijen = await haalAlleRijen<ExtraWerkadresRij>((van, tot) =>
      db()
        .from('dossier_werkadressen')
        .select(WERKADRES_SELECT)
        .in('dossier_id', blok)
        .order('id')
        .range(van, tot),
    )
    for (const r of rijen) {
      const lijst = uit.get(r.dossier_id)
      if (lijst) lijst.push(r)
      else uit.set(r.dossier_id, [r])
    }
  }
  for (const lijst of uit.values()) lijst.sort((a, b) => a.volgorde - b.volgorde)
  return uit
}

/** Extra werkadressen met coördinaten binnen een vak rond een positie. */
export async function extraWerkadressenInVak(
  lat: number,
  lng: number,
  graadLat: number,
  graadLng: number,
): Promise<ExtraWerkadresRij[]> {
  const { data } = await db()
    .from('dossier_werkadressen')
    .select(WERKADRES_SELECT)
    .gte('lat', lat - graadLat)
    .lte('lat', lat + graadLat)
    .gte('lng', lng - graadLng)
    .lte('lng', lng + graadLng)
    .limit(1000)
  return (data ?? []) as ExtraWerkadresRij[]
}
