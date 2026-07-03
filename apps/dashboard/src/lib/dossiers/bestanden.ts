'use server'

import { bouw7VoorDossier } from './actions'
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
