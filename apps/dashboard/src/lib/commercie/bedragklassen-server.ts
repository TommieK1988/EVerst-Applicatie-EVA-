import 'server-only'

import { createAdminClient } from '@everts/database/server'
import { leesGrenzen, type Bedragklassegrenzen } from './bedragklassen'

/**
 * De ingestelde bedragklassegrenzen, zonder sessiecheck: ook de nachtelijke run en andere
 * server-code die zelf al rechten heeft gecontroleerd lezen ze hier.
 */
export async function leesBedragklassegrenzen(): Promise<Bedragklassegrenzen> {
  const { data } = await createAdminClient()
    .from('bedrijfsinstellingen').select('overige').eq('id', 1).maybeSingle()
  const overige = (data?.overige ?? {}) as Record<string, unknown>
  return leesGrenzen(overige.offerte_bedragklassen)
}
