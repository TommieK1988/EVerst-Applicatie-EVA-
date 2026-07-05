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

/** Lijst alle mappen in de root van de drive (gepagineerd) — deterministische fallback. */
async function listRootFolders(driveId: string): Promise<DriveItem[]> {
  const folders: DriveItem[] = []
  let url: string | undefined = `/drives/${driveId}/root/children?$select=id,name,webUrl,folder,parentReference&$top=200`
  for (let i = 0; i < 50 && url; i++) {
    const res: { value?: DriveItem[]; '@odata.nextLink'?: string } = await appGraphGet(url)
    for (const it of res.value ?? []) if (it.folder) folders.push(it)
    url = res['@odata.nextLink']
  }
  return folders
}

/** Filtert mappen waarvan de (genormaliseerde) naam met het (genormaliseerde) prefix begint. */
function opPrefix(folders: DriveItem[], prefix: string): DriveItem[] {
  const p = normaliseer(prefix)
  if (!p) return []
  return folders.filter((f) => f.name && normaliseer(f.name).startsWith(p))
}

/**
 * Bepaalt autonoom welke SharePoint-map bij een dossier hoort. De mapnaam begint
 * met het dossiernummer (of bouw7-id), gevolgd door het adres. Volgorde:
 * 1. Graph-zoekindex op nummer-prefix, 2. deterministische root-listing op prefix
 * (vangt gevallen waar de zoekindex een cijfer-prefix niet teruggeeft), 3. fuzzy titel.
 * Vergelijking is punctuatie-ongevoelig (2024.00123 == 2024-00123).
 * Stopt bij de eerste unieke match; >1 kandidaat → 'meerdere'; 0 → 'niet_gevonden'.
 */
export async function matchDossierFolder(dossier: DossierMatchInput, driveId: string): Promise<MatchResultaat> {
  const prefixes = [dossier.dossiernummer, dossier.bouw7Id].filter((x): x is string => !!x)

  // 1. Snel: Graph-zoekindex, mapnaam begint met dossiernummer/bouw7-id
  for (const p of prefixes) {
    const raak = opPrefix(await zoekMappen(driveId, p), p)
    if (raak.length === 1) return alsMatch(raak[0], driveId)
    if (raak.length > 1) return { status: 'meerdere' }
  }

  // 2. Deterministisch: alle root-mappen oplijsten en op prefix filteren
  if (prefixes.length) {
    const rootFolders = await listRootFolders(driveId)
    for (const p of prefixes) {
      const raak = opPrefix(rootFolders, p)
      if (raak.length === 1) return alsMatch(raak[0], driveId)
      if (raak.length > 1) return { status: 'meerdere' }
    }
  }

  // 3. Fuzzy op titel (laatste redmiddel)
  if (dossier.titel) {
    const doel = normaliseer(dossier.titel)
    const kandidaten = await zoekMappen(driveId, dossier.titel)
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
