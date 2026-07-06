import 'server-only'
import { createAdminClient } from '@everts/database/server'
import { GeenToegangError } from '@/lib/auth/rechten'
import { isDossierAfgesloten } from '@/components/dossiers/types'

/**
 * Server-side vangnet: gooit `GeenToegangError` als het dossier definitief is afgesloten
 * (Financieel afgesloten / Verloren / Vervallen, of Bouw7-projectstatus '07.'). Zulke dossiers
 * zijn overal **alleen-lezen** — roep dit aan bovenin elke muterende server-action die op een
 * dossier werkt, zodat een afgesloten dossier ook via een kale RPC-aanroep onwijzigbaar blijft.
 *
 * Bewust tolerant: als het dossier niet gevonden wordt (bijv. losse calc zonder dossier) laten we
 * de mutatie door — de guard blokkeert alleen wanneer het dossier aantoonbaar afgesloten is.
 */
export async function assertDossierBewerkbaar(dossierId: string | null | undefined): Promise<void> {
  if (!dossierId) return
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const { data } = await supabase
    .from('dossiers')
    .select('hoofdstatus, aanvraag_substatus, offerte_substatus, opdracht_substatus, bouw7_projectstatus_naam')
    .eq('id', dossierId)
    .maybeSingle()

  if (data && isDossierAfgesloten(data)) {
    throw new GeenToegangError('Dit dossier is afgesloten en alleen-lezen')
  }
}
