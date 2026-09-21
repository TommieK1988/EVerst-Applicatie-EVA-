import 'server-only'

/**
 * Wie een verkoopkans of actie toegewezen kan krijgen vanuit de mobiele module Commercieel.
 *
 * Staat apart omdat beide vastleg-schermen hem nodig hebben: het klantbeeld en de kaart van
 * één contactpersoon. Dezelfde lijst op beide plekken, anders krijg je op de ene pagina wel
 * en op de andere geen collega te zien.
 *
 * Begrensd op actieve medewerkers: enkele tientallen, ruim onder de 1000 rijen waarop
 * PostgREST stil afkapt, en precies de groep die iets kan oppakken. Wie geen `auth_user_id`
 * heeft kan geen actie toegewezen krijgen (die landt via `task_assignees` op de auth-user);
 * dat filtert `VastleggenSheet` af, zodat zo iemand wél een verkoopkans kan krijgen.
 */

import { createAdminClient } from '@everts/database/server'

export type ToewijsbareMedewerker = {
  id: string
  naam: string
  authUserId: string | null
}

export async function leesToewijsbareMedewerkers(): Promise<ToewijsbareMedewerker[]> {
  const { data } = await createAdminClient()
    .from('medewerkers')
    .select('id, voornaam, tussenvoegsel, achternaam, auth_user_id')
    .eq('actief', true)
    .order('voornaam')

  return (data ?? []).map(m => ({
    id: m.id,
    naam: [m.voornaam, m.tussenvoegsel, m.achternaam].filter(Boolean).join(' ').trim() || 'Naamloos',
    authUserId: m.auth_user_id,
  }))
}
