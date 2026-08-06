import 'server-only'
import { createAdminClient } from '@everts/database/server'
import { getCurrentMedewerker, type CurrentMedewerker } from '@/lib/auth/rechten'
import { DIRECTIE_AFDELING, type Goedkeuring, type GoedkeuringRol } from './types'

export type BeoordeelContext = {
  medewerker: CurrentMedewerker | null
  /** Mag deze gebruiker goedkeuren/terugsturen? */
  magBeoordelen: boolean
  /** Rol voor de UI. */
  rol: GoedkeuringRol
  isDirectie: boolean
  isController: boolean
}

/**
 * Bepaalt of de ingelogde gebruiker een goedkeuring op dit dossier mag beoordelen:
 * de toegewezen controller van het dossier, iedereen uit afdeling Directie, de
 * medewerker aan wie de aanvraag is gericht, of de gebruiker aan wie hij is
 * overgedragen. Zonder toegewezen controller kan alleen Directie beoordelen —
 * daarom wijst de aanvrager er dan zelf één aan. Meekijkers mogen opmerken maar
 * niet keuren.
 */
export async function bepaalBeoordeelContext(
  dossierId: string | null,
  goedkeuring?: Pick<Goedkeuring, 'gedelegeerd_aan' | 'meekijkers' | 'aangevraagd_door' | 'beoordelaar_id'> | null,
): Promise<BeoordeelContext> {
  const medewerker = await getCurrentMedewerker()
  if (!medewerker) return { medewerker: null, magBeoordelen: false, rol: 'geen', isDirectie: false, isController: false }

  const isDirectie = (medewerker.afdeling ?? '').trim().toLowerCase() === DIRECTIE_AFDELING.toLowerCase()

  let isController = false
  if (dossierId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any
    const { data: dossier } = await db.from('dossiers').select('controller_id').eq('id', dossierId).maybeSingle()
    isController = dossier?.controller_id != null && dossier.controller_id === medewerker.id
  }

  const isGedelegeerde = goedkeuring?.gedelegeerd_aan != null && goedkeuring.gedelegeerd_aan === medewerker.id
  const isAangewezen = goedkeuring?.beoordelaar_id != null && goedkeuring.beoordelaar_id === medewerker.id
  const isMeekijker = (goedkeuring?.meekijkers ?? []).includes(medewerker.id)
  const isAanvrager = goedkeuring?.aangevraagd_door != null && goedkeuring.aangevraagd_door === medewerker.id

  const magBeoordelen = isController || isDirectie || isGedelegeerde || isAangewezen

  const rol: GoedkeuringRol = magBeoordelen
    ? 'beoordelaar'
    : isMeekijker
    ? 'meekijker'
    : isAanvrager
    ? 'aanvrager'
    : 'geen'

  return { medewerker, magBeoordelen, rol, isDirectie, isController }
}
