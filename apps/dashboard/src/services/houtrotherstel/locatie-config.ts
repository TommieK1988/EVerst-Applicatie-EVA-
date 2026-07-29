'use server'

import { createAdminClient } from '@everts/database/server'
import { assertDossierBewerkbaar } from '@/lib/dossiers/guards'
import { saneerBoom } from '@/lib/houtrotherstel/locatie-boom'
import type { LocatieBoom } from '@/lib/houtrotherstel/types'

/**
 * Per-dossier locatieboom die de projectleider inricht en waaruit de vakman in de
 * app kiest (afhankelijke keuzelijsten). Opgeslagen in `public.houtrot_dossier_config`,
 * kolom `boom`. Server actions omdat de houtrot-clientcomponenten (mobiel +
 * desktop-tab) ze nodig hebben en `public` niet leesbaar is vanuit de houtrot-
 * scoped browserclient.
 */

export async function getLocatieBoom(dossierId: string): Promise<LocatieBoom> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const { data } = await supabase
    .from('houtrot_dossier_config')
    .select('boom')
    .eq('dossier_id', dossierId)
    .maybeSingle()
  return saneerBoom(data?.boom)
}

export async function setLocatieBoom(
  dossierId: string,
  boom: LocatieBoom,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await assertDossierBewerkbaar(dossierId)
  const schoon = saneerBoom(boom)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const { error } = await supabase
    .from('houtrot_dossier_config')
    .upsert(
      { dossier_id: dossierId, boom: schoon, updated_at: new Date().toISOString() },
      { onConflict: 'dossier_id' },
    )
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
