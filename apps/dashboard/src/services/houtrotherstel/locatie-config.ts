'use server'

import { createAdminClient } from '@everts/database/server'
import { assertDossierBewerkbaar } from '@/lib/dossiers/guards'
import type { LocatieNiveau } from '@/lib/houtrotherstel/types'

/**
 * Per-dossier locatieniveaus die de projectleider instelt en waaruit de vakman in
 * de app kiest (max 3). Opgeslagen in `public.houtrot_dossier_config`. Server
 * actions omdat de houtrot-clientcomponenten (mobiel + desktop-tab) ze nodig
 * hebben en `public` niet leesbaar is vanuit de houtrot-scoped browserclient.
 */

const MAX_NIVEAUS = 3

/** Saneert ruwe invoer tot maximaal 3 niveaus met een naam en schone opties. */
function saneerNiveaus(ruw: unknown): LocatieNiveau[] {
  if (!Array.isArray(ruw)) return []
  return ruw
    .slice(0, MAX_NIVEAUS)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((n: any): LocatieNiveau => ({
      naam: String(n?.naam ?? '').trim(),
      opties: Array.isArray(n?.opties)
        ? n.opties.map((o: unknown) => String(o ?? '').trim()).filter(Boolean)
        : [],
    }))
    .filter(n => n.naam.length > 0)
}

export async function getLocatieNiveaus(dossierId: string): Promise<LocatieNiveau[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const { data } = await supabase
    .from('houtrot_dossier_config')
    .select('niveaus')
    .eq('dossier_id', dossierId)
    .maybeSingle()
  return saneerNiveaus(data?.niveaus)
}

export async function setLocatieNiveaus(
  dossierId: string,
  niveaus: LocatieNiveau[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  await assertDossierBewerkbaar(dossierId)
  const schoon = saneerNiveaus(niveaus)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const { error } = await supabase
    .from('houtrot_dossier_config')
    .upsert(
      { dossier_id: dossierId, niveaus: schoon, updated_at: new Date().toISOString() },
      { onConflict: 'dossier_id' },
    )
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
