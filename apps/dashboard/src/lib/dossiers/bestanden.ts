'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@everts/database/server'
import { bouw7VoorDossier } from './actions'
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
}

/**
 * Leest de projectbestanden van een dossier live uit Bouw7 (GET /list/project-files, Heimdall).
 * Read-only overzicht; downloaden loopt via de proxyroute /api/bouw7/bestand/{secureHash}.
 */
export async function getDossierBestanden(dossierId: string): Promise<DossierBestandenData> {
  const ctx = await bouw7VoorDossier(dossierId)
  if (!ctx) return { beschikbaar: false, bestanden: [] }
  const { client, bouw7Id } = ctx

  try {
    const resp = await client.get<{ items?: Bouw7ProjectFile[] }>('/list/project-files', {
      q: `project.id = ${bouw7Id} LIMIT 500`,
    })
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
    return { beschikbaar: true, bestanden }
  } catch {
    return { beschikbaar: false, bestanden: [] }
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
