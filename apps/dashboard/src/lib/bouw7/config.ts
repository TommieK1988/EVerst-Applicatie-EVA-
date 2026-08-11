/**
 * Toegang tot de Bouw7-integratieconfig, met een korte cache.
 *
 * Elke live tab las de `integraties`-rij opnieuw op om een client te kunnen bouwen — twee
 * DB-queries per tab-load (het dossier én de config), terwijl die config vrijwel nooit verandert.
 *
 * Bewust een module-cache per serverinstantie en niet `unstable_cache`: de config bevat de API key,
 * en die hoort niet in de Next data-cache (die kan naar schijf gepersisteerd worden). De korte TTL
 * zorgt dat een gewijzigde sleutel vanzelf doorkomt; `vergeetBouw7Config()` maakt dat direct.
 */

import { createAdminClient } from '@everts/database/server'
import { Bouw7Client } from './client'

const CONFIG_TTL_MS = 60_000

let cache: { config: Record<string, string> | null; opgehaaldOp: number } | null = null
/** Lopende query, zodat gelijktijdige aanroepen er één delen i.p.v. er N afvuren. */
let inFlight: Promise<Record<string, string> | null> | null = null

async function laadConfig(): Promise<Record<string, string> | null> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('integraties')
    .select('config')
    .eq('naam', 'bouw7')
    .maybeSingle()

  const config = (data?.config as Record<string, string> | undefined) ?? null
  cache = { config, opgehaaldOp: Date.now() }
  return config
}

/**
 * De ruwe `config`-kolom van de Bouw7-integratie, of null wanneer de integratie nog niet bestaat.
 * Ruw (en niet gevalideerd) zodat aanroepers hun eigen, preciezere foutmelding kunnen geven.
 */
export async function getBouw7RawConfig(): Promise<Record<string, string> | null> {
  if (cache && Date.now() - cache.opgehaaldOp < CONFIG_TTL_MS) return cache.config
  if (!inFlight) {
    inFlight = laadConfig().finally(() => { inFlight = null })
  }
  return inFlight
}

/** Vergeet de gecachete config — aanroepen na het opslaan van nieuwe integratie-instellingen. */
export function vergeetBouw7Config(): void {
  cache = null
}

/** Een Bouw7-client, of null wanneer de integratie niet (volledig) is geconfigureerd. */
export async function getBouw7ClientOfNull(): Promise<Bouw7Client | null> {
  const config = await getBouw7RawConfig()
  if (!config?.api_key || !config?.app_name) return null
  return new Bouw7Client(config.api_key, config.app_name)
}
