'use server'

/**
 * dossiers/werkzaamheden-actions.ts
 *
 * Het blok "Gevraagde werkzaamheden" op het Informatie-tabblad: opslaan wat een
 * mens erin zet, en op verzoek een nieuwe samenvatting voorstellen uit álle
 * dossierbestanden.
 *
 * Het voorstel wordt bewust NIET direct opgeslagen. `stelSamenvattingVoor` geeft
 * alleen de nieuwe tekst terug; het scherm legt oud en nieuw naast elkaar en pas
 * na een bevestiging slaat `bewaarWerkzaamheden` hem op. Ongevraagd overschrijven
 * zou een handmatige aanscherping wissen — en juist die is het meest waard.
 */

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'

import { vereisRecht } from '@/lib/auth/rechten'
import { assertDossierBewerkbaar } from './guards'

/** Slaat de (bewerkte) samenvatting op het dossier op. */
export async function bewaarWerkzaamheden(
  dossierId: string,
  tekst: string,
  herkomst?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const { medewerker } = await vereisRecht('dossiers', 'schrijven')
  await assertDossierBewerkbaar(dossierId)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const schoon = tekst.trim()

  const patch: Record<string, unknown> = {
    gevraagde_werkzaamheden: schoon || null,
    gevraagde_werkzaamheden_op: new Date().toISOString(),
  }
  // Alleen overschrijven als er een nieuwe herkomst is; een handmatige aanpassing
  // laat de oorspronkelijke herkomstregel staan.
  if (herkomst !== undefined) patch.gevraagde_werkzaamheden_bron = herkomst
  else if (schoon) patch.gevraagde_werkzaamheden_bron = `Aangepast door ${[medewerker.voornaam, medewerker.achternaam].filter(Boolean).join(' ')}.`

  const { error } = await supabase.from('dossiers').update(patch).eq('id', dossierId)
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/dossiers/${dossierId}`)
  return { ok: true }
}

/**
 * Stelt een nieuwe samenvatting voor uit alle dossierbestanden — SharePoint,
 * Bouw7 en de oorspronkelijke intakebijlagen. Slaat niets op.
 */
export async function stelSamenvattingVoor(
  dossierId: string,
): Promise<{ ok: boolean; tekst?: string | null; herkomst?: string | null; gemist?: string[]; error?: string }> {
  await vereisRecht('dossiers', 'schrijven')
  await assertDossierBewerkbaar(dossierId)

  const { stelDossierSamenvattingVoor } = await import('@/lib/mailintake/werkzaamheden-uitvoeren')
  const res = await stelDossierSamenvattingVoor(dossierId)

  return res.ok
    ? { ok: true, tekst: res.tekst, herkomst: res.herkomst, gemist: res.gemist }
    : { ok: false, error: res.fout ?? 'Samenvatten mislukt.', gemist: res.gemist }
}
