'use server'

import { createAdminClient } from '@everts/database/server'
import type { BtwTarief } from '@everts/database/platform-types'
import { vereisSessie } from '@/lib/auth/rechten'
import { naarKeuze, sorteerTarieven, type BtwTariefKeuze } from './btw'

/**
 * Actieve BTW-tarieven uit de stamgegevens. Eén bron voor calculatie, offerte, werkbegroting
 * en facturatie; de lijst wordt gevuld door de Bouw7-sync (zie derive-stamdata.ts).
 */
export async function laadBtwTarieven(): Promise<BtwTariefKeuze[]> {
  await vereisSessie()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const { data, error } = await supabase
    .from('btw_tarieven')
    .select('id, bouw7_id, label, percentage, verlegd')
    .eq('actief', true)
  if (error) throw new Error(error.message)
  return sorteerTarieven(((data ?? []) as BtwTarief[]).map(naarKeuze))
}
