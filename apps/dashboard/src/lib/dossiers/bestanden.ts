'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@everts/database/server'
import { dossierBouw7Id, leesDossierBron } from '@/lib/bouw7/snapshot'
import { getCurrentMedewerker } from '@/lib/auth/rechten'
import type { Bouw7ProjectFile } from '@/lib/bouw7/client'

export type DossierBestand = {
  id: number
  naam: string
  omschrijving: string | null
  extensie: string | null
  grootte: number | null
  categorie: string | null
  /** Storage-hash voor de download-proxy (GET /storage/{fileHash}/download). */
  fileHash: string | null
  aangemaaktDoor: string | null
  datum: string | null
}

export type DossierBestandenData = {
  beschikbaar: boolean
  bestanden: DossierBestand[]
  /** ISO-tijdstip van de laatste ophaal uit Bouw7; null = nog nooit opgehaald. */
  opgehaaldOp: string | null
}

/**
 * De projectbestanden van een dossier uit de Bouw7-snapshot (bron: GET /list/project-files).
 *
 * Read-only overzicht. Het downloaden van een bestand loopt nog wél live via de proxyroute
 * /api/bouw7/bestand/{secureHash} — de bytes halen we pas op als iemand er echt op klikt.
 */
export async function getDossierBestanden(dossierId: string): Promise<DossierBestandenData> {
  const leeg: DossierBestandenData = { beschikbaar: false, bestanden: [], opgehaaldOp: null }
  const bouw7Id = await dossierBouw7Id(dossierId)
  if (!bouw7Id) return leeg

  try {
    const stand = await leesDossierBron<{ items?: Bouw7ProjectFile[] }>(dossierId, 'project_files')
    const resp = stand.data
    if (!resp) return leeg
    const bestanden: DossierBestand[] = (resp.items ?? []).map(f => ({
      id: f.id,
      naam: f.name?.trim() || f.fileName?.trim() || 'Bestand',
      omschrijving: f.description ?? null,
      extensie: f.extension ?? null,
      grootte: f.fileSize ?? null,
      categorie: f.category?.name ?? null,
      fileHash: f.fileHash ?? null,
      aangemaaktDoor: f.createdBy?.username ?? null,
      datum: f.createdAt ? f.createdAt.slice(0, 10) : null,
    }))
    // Sorteer op categorie (a→z), binnen categorie op datum (nieuw→oud).
    bestanden.sort((a, b) =>
      (a.categorie ?? 'zzz').localeCompare(b.categorie ?? 'zzz') || (b.datum ?? '').localeCompare(a.datum ?? ''))
    return { beschikbaar: true, bestanden, opgehaaldOp: stand.opgehaaldOp }
  } catch {
    return leeg
  }
}

/**
 * Zichtbaarheid van dossierbestanden in de mobiele app.
 *
 * Bewust opt-in: alleen bestanden die hier als zichtbaar staan verschijnen op de
 * telefoon. Zonder rij is een bestand dus NIET zichtbaar — de buitendienst krijgt
 * niet de hele projectmap mee. Bestanden zelf blijven read-only uit Bouw7; alleen
 * deze keuze leggen we in EVA vast.
 */
/** Array (geen Set): dit is een server action, en die moet serialiseerbaar teruggeven. */
export async function getAppZichtbareBestandIds(dossierId: string): Promise<number[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const { data } = await supabase
    .from('dossier_bestand_app_zichtbaar')
    .select('bouw7_bestand_id')
    .eq('dossier_id', dossierId)
    .eq('zichtbaar', true)

  return ((data ?? []) as { bouw7_bestand_id: number }[]).map(r => Number(r.bouw7_bestand_id))
}

export async function setBestandAppZichtbaar(
  dossierId: string,
  bestandId: number,
  zichtbaar: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const medewerker = await getCurrentMedewerker()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  const { error } = await supabase
    .from('dossier_bestand_app_zichtbaar')
    .upsert({
      dossier_id: dossierId,
      bouw7_bestand_id: bestandId,
      zichtbaar,
      gewijzigd_op: new Date().toISOString(),
      gewijzigd_door: medewerker?.id ?? null,
    }, { onConflict: 'dossier_id,bouw7_bestand_id' })

  if (error) return { ok: false, error: error.message }

  revalidatePath(`/opdrachten/${dossierId}/bestanden`)
  return { ok: true }
}
