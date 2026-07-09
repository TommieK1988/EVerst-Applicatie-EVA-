import 'server-only'
import { createAdminClient } from '@everts/database/server'
import { GeenToegangError } from '@/lib/auth/rechten'

/** Statussen waarin een offerte niet meer gewijzigd mag worden (alleen kopiëren). */
export const VERGRENDELDE_QUOTE_STATUSSEN = ['verzonden'] as const

/**
 * Server-side vangnet: gooit `GeenToegangError` als de offerte definitief
 * (verzonden) is. Zulke offertes zijn onveranderbaar; wijzigen kan alleen door
 * te kopiëren naar een nieuwe versie.
 * Roep dit aan bovenin elke muterende offerte-server-action.
 *
 * Tolerant: niet-gevonden offerte laat de mutatie door (guard blokkeert alleen
 * wanneer de status aantoonbaar vergrendeld is).
 */
export async function assertQuoteBewerkbaar(quoteId: string | null | undefined): Promise<void> {
  if (!quoteId) return
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const { data } = await supabase
    .from('quotes')
    .select('status')
    .eq('id', quoteId)
    .maybeSingle()

  if (data && (VERGRENDELDE_QUOTE_STATUSSEN as readonly string[]).includes(data.status)) {
    throw new GeenToegangError('Deze offerte is verzonden of definitief — kopieer naar een nieuwe versie om te wijzigen')
  }
}
