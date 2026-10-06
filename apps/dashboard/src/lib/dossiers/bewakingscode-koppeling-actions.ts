'use server'

/**
 * Server actions rond de koppeling bewakingscode → Hoofdopdracht (zie `bewakingscode-koppeling.ts`).
 *
 * Alleen een indeling voor de werkbegroting en Verwacht resultaat: koppelen of ontkoppelen
 * verandert geen bedrag. Stelposten, meerwerk en regie houden hun eigen post en zijn hier niet
 * te koppelen.
 */

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@everts/database/server'
import { vereisSessie } from '@/lib/auth/rechten'
import { assertDossierBewerkbaar } from './guards'
import { leesEigenBewakingscodes } from './eigen-bewakingscodes'
import { kaleBewakingscode, leesKoppelingen } from './bewakingscode-koppeling'

/** De aan de Hoofdopdracht gekoppelde bewakingscodes van een dossier. */
export async function getKoppelingen(dossierId: string): Promise<string[]> {
  await vereisSessie()
  return [...(await leesKoppelingen(dossierId))]
}

export async function koppelAanHoofdopdracht(
  dossierId: string,
  kostengroep: string,
  gekoppeld: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const medewerker = await vereisSessie()
  await assertDossierBewerkbaar(dossierId)

  const code = kaleBewakingscode(kostengroep)
  if (!code) return { ok: false, error: 'Geen bewakingscode om te koppelen.' }

  // Een stelpost, meerwerkregel of regiecode heeft zijn eigen post; die hoort niet bij de
  // Hoofdopdracht te staan.
  const eigen = (await leesEigenBewakingscodes(dossierId))
    .find(e => e.code === code && e.soort !== 'correctie')
  if (eigen) {
    return { ok: false, error: `${code} is een ${eigen.soort} en heeft zijn eigen post; die koppel je niet aan de Hoofdopdracht.` }
  }

  const supabase = createAdminClient()
  const { error } = gekoppeld
    ? await supabase.from('bewakingscode_koppelingen').upsert(
      { dossier_id: dossierId, bewakingscode: code, doel: 'hoofdopdracht', gekoppeld_door: medewerker.id },
      { onConflict: 'dossier_id,bewakingscode', ignoreDuplicates: true },
    )
    : await supabase.from('bewakingscode_koppelingen').delete()
      .eq('dossier_id', dossierId).eq('bewakingscode', code)
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/opdrachten/${dossierId}`, 'layout')
  return { ok: true }
}
