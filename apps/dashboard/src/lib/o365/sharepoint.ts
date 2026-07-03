/**
 * o365/sharepoint.ts
 *
 * App-only Graph-helpers voor dossier-bestanden in SharePoint. De dossiermappen
 * bestaan al (elders aangemaakt); EVA zoekt zelfstandig de juiste map bij een
 * dossier en toont de bestanden. Er worden nooit mappen aangemaakt.
 */

import { appGraphGet } from './graph'

export interface SharePointBestand {
  id: string
  naam: string
  extensie: string | null
  grootte: number | null
  webUrl: string | null
  datum: string | null
  door: string | null
}

interface DriveItem {
  id: string
  name?: string
  webUrl?: string
  size?: number
  lastModifiedDateTime?: string
  folder?: { childCount?: number }
  file?: { mimeType?: string }
  createdBy?: { user?: { displayName?: string } }
  parentReference?: { driveId?: string }
}

export type MatchStatus = 'gematcht' | 'niet_gevonden' | 'meerdere'

export interface MatchResultaat {
  status: MatchStatus
  driveId?: string
  itemId?: string
  webUrl?: string | null
}

interface DossierMatchInput {
  dossiernummer: string | null
  bouw7Id: string | null
  titel: string | null
}

function normaliseer(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Zoekt mappen in de drive die matchen op de query (alleen folders). */
async function zoekMappen(driveId: string, query: string): Promise<DriveItem[]> {
  const q = query.replace(/'/g, '').trim()
  if (!q) return []
  const res = await appGraphGet<{ value?: DriveItem[] }>(
    `/drives/${driveId}/root/search(q='${encodeURIComponent(q)}')?$select=id,name,webUrl,folder,parentReference&$top=50`,
  )
  return (res.value ?? []).filter((it) => it.folder)
}

function alsMatch(item: DriveItem, driveId: string): MatchResultaat {
  return { status: 'gematcht', driveId: item.parentReference?.driveId ?? driveId, itemId: item.id, webUrl: item.webUrl ?? null }
}

/**
 * Bepaalt autonoom welke SharePoint-map bij een dossier hoort. Volgorde:
 * 1. exact op dossiernummer, 2. op bouw7-id, 3. fuzzy op titel.
 * Stopt bij de eerste unieke match; >1 kandidaat → 'meerdere'; 0 → 'niet_gevonden'.
 */
export async function matchDossierFolder(dossier: DossierMatchInput, driveId: string): Promise<MatchResultaat> {
  // 1. Dossiernummer
  if (dossier.dossiernummer) {
    const kandidaten = await zoekMappen(driveId, dossier.dossiernummer)
    const raak = kandidaten.filter((f) => f.name?.includes(dossier.dossiernummer!))
    if (raak.length === 1) return alsMatch(raak[0], driveId)
    if (raak.length > 1) return { status: 'meerdere' }
  }

  // 2. Bouw7-id
  if (dossier.bouw7Id) {
    const kandidaten = await zoekMappen(driveId, dossier.bouw7Id)
    const raak = kandidaten.filter((f) => f.name?.includes(dossier.bouw7Id!))
    if (raak.length === 1) return alsMatch(raak[0], driveId)
  }

  // 3. Titel (fuzzy, genormaliseerd)
  if (dossier.titel) {
    const kandidaten = await zoekMappen(driveId, dossier.titel)
    const doel = normaliseer(dossier.titel)
    const raak = kandidaten.filter((f) => f.name && (normaliseer(f.name).includes(doel) || doel.includes(normaliseer(f.name))))
    if (raak.length === 1) return alsMatch(raak[0], driveId)
    if (raak.length > 1) return { status: 'meerdere' }
  }

  return { status: 'niet_gevonden' }
}

/** Lijst de bestanden (geen submappen) in een dossiermap. */
export async function listFolderChildren(driveId: string, itemId: string): Promise<SharePointBestand[]> {
  const res = await appGraphGet<{ value?: DriveItem[] }>(
    `/drives/${driveId}/items/${itemId}/children?$select=id,name,size,webUrl,file,folder,lastModifiedDateTime,createdBy&$top=200`,
  )
  return (res.value ?? [])
    .filter((it) => it.file)
    .map((f) => {
      const punt = f.name?.lastIndexOf('.') ?? -1
      return {
        id: f.id,
        naam: f.name ?? 'Bestand',
        extensie: punt > 0 ? (f.name ?? '').slice(punt + 1) : null,
        grootte: f.size ?? null,
        webUrl: f.webUrl ?? null,
        datum: f.lastModifiedDateTime ? f.lastModifiedDateTime.slice(0, 10) : null,
        door: f.createdBy?.user?.displayName ?? null,
      }
    })
}

/** Resolvet een SharePoint/OneDrive deel-link naar een map-driveItem (voor handmatig koppelen). */
export async function resolveShareLink(shareLink: string): Promise<MatchResultaat> {
  const b64 = Buffer.from(shareLink.trim(), 'utf-8').toString('base64')
  const token = 'u!' + b64.replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-')
  const item = await appGraphGet<DriveItem>(
    `/shares/${token}/driveItem?$select=id,name,webUrl,folder,parentReference`,
  )
  if (!item.folder) {
    // Link naar een bestand → gebruik de bovenliggende map is niet triviaal; vraag een map-link.
    return { status: 'niet_gevonden' }
  }
  const driveId = item.parentReference?.driveId
  if (!driveId || !item.id) return { status: 'niet_gevonden' }
  return { status: 'gematcht', driveId, itemId: item.id, webUrl: item.webUrl ?? null }
}
