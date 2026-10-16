'use server'

/**
 * Bedragklassegrenzen van de offertebewaking lezen en instellen (Instellingen → Offertes →
 * Offertebewaking). Opgeslagen in de vrije JSON-bak van `bedrijfsinstellingen`, zelfde patroon
 * als de geldigheidstermijn van offertes.
 */

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@everts/database/server'
import { vereisRecht, vereisSessie } from '@/lib/auth/rechten'
import { grenzenFout, type Bedragklassegrenzen } from './bedragklassen'
import { leesBedragklassegrenzen } from './bedragklassen-server'

export async function getBedragklassegrenzen(): Promise<Bedragklassegrenzen> {
  await vereisSessie()
  return leesBedragklassegrenzen()
}

export async function setBedragklassegrenzen(
  g: Bedragklassegrenzen,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await vereisRecht('instellingen', 'beheren')
  const grenzen = { kleinTot: Number(g.kleinTot), grootVanaf: Number(g.grootVanaf), megaVanaf: Number(g.megaVanaf) }
  const fout = grenzenFout(grenzen)
  if (fout) return { ok: false, error: fout }

  const supabase = createAdminClient()
  const { data } = await supabase.from('bedrijfsinstellingen').select('overige').eq('id', 1).maybeSingle()
  const overige = (data?.overige ?? {}) as Record<string, unknown>
  const { error } = await supabase.from('bedrijfsinstellingen')
    .update({ overige: { ...overige, offerte_bedragklassen: grenzen } }).eq('id', 1)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/instellingen/offertes')
  revalidatePath('/offertes')
  return { ok: true }
}
