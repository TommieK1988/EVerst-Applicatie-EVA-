import { createAdminClient } from '@everts/database/server'

/**
 * ISO-tijdstip van de laatste sync-run voor een entiteit uit `sync_log`
 * (bv. 'dossiers', 'relaties', 'debiteuren', 'management_projecten', 'planning'),
 * of null als er nog nooit gesynchroniseerd is. Voor de "Sync: …"-labels bij de knoppen.
 */
export async function getLaatsteSyncTijd(entiteit: string): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const { data } = await supabase
    .from('sync_log')
    .select('uitgevoerd_op')
    .eq('integratie', 'bouw7')
    .eq('entiteit', entiteit)
    .order('uitgevoerd_op', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.uitgevoerd_op ?? null
}
