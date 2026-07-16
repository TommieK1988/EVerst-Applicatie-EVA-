'use server'

import { createAdminClient } from '@everts/database/server'
import { appGraphFetch } from '@/lib/o365/graph'
import {
  matchDossierFolder,
  listFolderChildren,
  resolveShareLink,
  resolveDriveContext,
  type DriveContext,
  type SharePointBestand,
  type MatchStatus,
} from '@/lib/o365/sharepoint'

export type { SharePointBestand } from '@/lib/o365/sharepoint'

export type DossierSharePointData = {
  /** O365_DOSSIER_DRIVE_ID is ingesteld. */
  geconfigureerd: boolean
  status: MatchStatus | null
  mapUrl: string | null
  bestanden: SharePointBestand[]
  /** Leesbare reden wanneer er iets misgaat (i.p.v. een crash). */
  fout?: string | null
}

const LEEG: DossierSharePointData = { geconfigureerd: false, status: null, mapUrl: null, bestanden: [], fout: null }

interface DossierRij {
  dossiernummer: string | null
  bouw7_id: string | number | null
  titel: string | null
  sharepoint_drive_id: string | null
  sharepoint_item_id: string | null
  sharepoint_web_url: string | null
  sharepoint_match_status: MatchStatus | null
}

const SELECT =
  'dossiernummer, bouw7_id, titel, sharepoint_drive_id, sharepoint_item_id, sharepoint_web_url, sharepoint_match_status'

/** Maakt van een (Graph/token/DB) fout een korte, leesbare melding. */
function netteFout(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  return msg.length > 300 ? msg.slice(0, 300) + '…' : msg
}

/**
 * Leest de SharePoint-dossierbestanden. Matcht de map autonoom (en cachet de match
 * op het dossier) als dat nog niet gebeurd is; lijst daarna de bestanden.
 * Gooit nooit — geeft bij fouten een `fout`-melding terug.
 */
export async function getDossierSharePointBestanden(dossierId: string): Promise<DossierSharePointData> {
  const envValue = process.env.O365_DOSSIER_DRIVE_ID
  if (!envValue) return LEEG

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createAdminClient() as any
    const { data: dossier } = await supabase.from('dossiers').select(SELECT).eq('id', dossierId).single()
    const d = dossier as DossierRij | null
    if (!d) return { ...LEEG, geconfigureerd: true }

    let spDriveId = d.sharepoint_drive_id
    let spItemId = d.sharepoint_item_id
    let mapUrl = d.sharepoint_web_url
    let status: MatchStatus | null = d.sharepoint_match_status

    // Nog niet (succesvol) gematcht → nu proberen en cachen
    if (status !== 'gematcht' || !spItemId || !spDriveId) {
      try {
        const ctx = await resolveDriveContext(envValue)
        if (!ctx) {
          return {
            geconfigureerd: true,
            status: null,
            mapUrl: null,
            bestanden: [],
            fout: 'Kon O365_DOSSIER_DRIVE_ID niet herleiden — geef een geldige drive-id of een SharePoint-link naar de dossierbibliotheek/-map.',
          }
        }
        const m = await matchDossierFolder(
          { dossiernummer: d.dossiernummer, bouw7Id: d.bouw7_id != null ? String(d.bouw7_id) : null, titel: d.titel },
          ctx,
        )
        status = m.status
        spDriveId = m.driveId ?? null
        spItemId = m.itemId ?? null
        mapUrl = m.webUrl ?? null
        await supabase
          .from('dossiers')
          .update({
            sharepoint_drive_id: spDriveId,
            sharepoint_item_id: spItemId,
            sharepoint_web_url: mapUrl,
            sharepoint_match_status: status,
          })
          .eq('id', dossierId)
      } catch (err) {
        return { geconfigureerd: true, status: null, mapUrl: null, bestanden: [], fout: netteFout(err) }
      }
    }

    if (status !== 'gematcht' || !spItemId || !spDriveId) {
      return { geconfigureerd: true, status, mapUrl, bestanden: [], fout: null }
    }

    try {
      const bestanden = await listFolderChildren(spDriveId, spItemId)
      return { geconfigureerd: true, status: 'gematcht', mapUrl, bestanden, fout: null }
    } catch (err) {
      return { geconfigureerd: true, status: 'gematcht', mapUrl, bestanden: [], fout: netteFout(err) }
    }
  } catch (err) {
    return { geconfigureerd: true, status: null, mapUrl: null, bestanden: [], fout: netteFout(err) }
  }
}

/** Reset de cache en zoekt de map opnieuw (knop bij niet-gevonden/meerdere). */
export async function hermatchDossierSharePoint(dossierId: string): Promise<DossierSharePointData> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createAdminClient() as any
    await supabase
      .from('dossiers')
      .update({ sharepoint_drive_id: null, sharepoint_item_id: null, sharepoint_web_url: null, sharepoint_match_status: null })
      .eq('id', dossierId)
  } catch (err) {
    return { geconfigureerd: true, status: null, mapUrl: null, bestanden: [], fout: netteFout(err) }
  }
  return getDossierSharePointBestanden(dossierId)
}

/** Koppelt handmatig een SharePoint-map via een deel-link (bij niet-gevonden/meerdere). */
export async function koppelDossierMapViaLink(dossierId: string, shareLink: string): Promise<DossierSharePointData> {
  let m
  try {
    m = await resolveShareLink(shareLink)
  } catch (err) {
    return { geconfigureerd: true, status: 'niet_gevonden', mapUrl: null, bestanden: [], fout: netteFout(err) }
  }

  if (m.status !== 'gematcht' || !m.driveId || !m.itemId) {
    return {
      geconfigureerd: true,
      status: 'niet_gevonden',
      mapUrl: null,
      bestanden: [],
      fout: 'De link kon niet naar een map worden herleid. Plak een link naar de map zelf (niet naar een bestand).',
    }
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createAdminClient() as any
    await supabase
      .from('dossiers')
      .update({
        sharepoint_drive_id: m.driveId,
        sharepoint_item_id: m.itemId,
        sharepoint_web_url: m.webUrl ?? null,
        sharepoint_match_status: 'gematcht',
      })
      .eq('id', dossierId)

    const bestanden = await listFolderChildren(m.driveId, m.itemId)
    return { geconfigureerd: true, status: 'gematcht', mapUrl: m.webUrl ?? null, bestanden, fout: null }
  } catch (err) {
    return { geconfigureerd: true, status: 'gematcht', mapUrl: m.webUrl ?? null, bestanden: [], fout: netteFout(err) }
  }
}

/* ─── Upload (bestanden meegestuurd bij een nieuwe aanvraag) ─────────────── */

/**
 * `bestanden` bevat per geslaagd bestand de driveItem-gegevens, zodat een
 * consument (documenten-module) het bestand kan terugvinden/linken. Consumenten
 * die dat niet nodig hebben (offerte-archivering) negeren het veld.
 */
export type UploadResultaat = {
  ok: boolean
  geuploaded: number
  mapUrl?: string | null
  fout?: string
  bestanden?: { naam: string; driveId: string | null; itemId: string | null; webUrl: string | null }[]
}

/** Container-pad ('root' of 'items/{id}') → Graph children-endpoint. */
function childrenPad(ctx: DriveContext): string {
  return ctx.containerPath === 'root'
    ? `/drives/${ctx.driveId}/root/children`
    : `/drives/${ctx.driveId}/${ctx.containerPath}/children`
}

/**
 * Bepaalt de dossiermap: bestaande cache → autonome match → anders **aanmaken**.
 * Een gloednieuwe aanvraag heeft nog geen map; die maken we hier aan met een naam die
 * begint met het dossiernummer, zodat de autonome match hem later terugvindt.
 */
async function bepaalOfMaakDossierMap(
  ctx: DriveContext,
  d: DossierRij,
): Promise<{ driveId: string; itemId: string; webUrl: string | null }> {
  const matchInput = {
    dossiernummer: d.dossiernummer,
    bouw7Id: d.bouw7_id != null ? String(d.bouw7_id) : null,
    titel: d.titel,
  }
  const m = await matchDossierFolder(matchInput, ctx)
  if (m.status === 'gematcht' && m.driveId && m.itemId) {
    return { driveId: m.driveId, itemId: m.itemId, webUrl: m.webUrl ?? null }
  }

  // Niet gevonden → map aanmaken onder de container.
  const naam = ([d.dossiernummer, d.titel].filter(Boolean).join(' ').trim()) || `Dossier ${d.dossiernummer ?? ''}`.trim()
  const res = await appGraphFetch(childrenPad(ctx), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: naam, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }),
  })
  if (res.status === 409) {
    // Bestaat toch al → opnieuw matchen.
    const m2 = await matchDossierFolder(matchInput, ctx)
    if (m2.status === 'gematcht' && m2.driveId && m2.itemId) {
      return { driveId: m2.driveId, itemId: m2.itemId, webUrl: m2.webUrl ?? null }
    }
  }
  if (!res.ok) throw new Error(`Kon SharePoint-map niet aanmaken (${res.status}): ${await res.text().catch(() => '')}`)
  const item = (await res.json()) as { id: string; webUrl?: string }
  return { driveId: ctx.driveId, itemId: item.id, webUrl: item.webUrl ?? null }
}

/**
 * Upload de meegestuurde bestanden van een (nieuwe) aanvraag naar de SharePoint-dossiermap.
 * Bestaat de map nog niet, dan wordt hij aangemaakt. Gooit nooit — geeft per saldo een
 * `fout`-melding terug zodat de UI het kan tonen zonder de aanvraag te blokkeren.
 */
export async function uploadDossierBestandenNaarSharePoint(dossierId: string, formData: FormData): Promise<UploadResultaat> {
  const envValue = process.env.O365_DOSSIER_DRIVE_ID
  if (!envValue) return { ok: false, geuploaded: 0, fout: 'SharePoint niet geconfigureerd (O365_DOSSIER_DRIVE_ID).' }

  const files = formData.getAll('bestanden').filter((f): f is File => f instanceof File)
  if (files.length === 0) return { ok: true, geuploaded: 0 }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createAdminClient() as any
    const { data: dossier } = await supabase.from('dossiers').select(SELECT).eq('id', dossierId).single()
    const d = dossier as DossierRij | null
    if (!d) return { ok: false, geuploaded: 0, fout: 'Dossier niet gevonden.' }

    const ctx = await resolveDriveContext(envValue)
    if (!ctx) return { ok: false, geuploaded: 0, fout: 'Kon O365_DOSSIER_DRIVE_ID niet herleiden naar een drive/map.' }

    // Map bepalen (of aanmaken) en cachen op het dossier.
    let driveId = d.sharepoint_drive_id
    let itemId = d.sharepoint_item_id
    let mapUrl = d.sharepoint_web_url
    if (!(d.sharepoint_match_status === 'gematcht' && driveId && itemId)) {
      const map = await bepaalOfMaakDossierMap(ctx, d)
      driveId = map.driveId; itemId = map.itemId; mapUrl = map.webUrl
      await supabase.from('dossiers').update({
        sharepoint_drive_id: driveId,
        sharepoint_item_id: itemId,
        sharepoint_web_url: mapUrl,
        sharepoint_match_status: 'gematcht',
      }).eq('id', dossierId)
    }

    // Bestanden uploaden (simple upload; geschikt voor gangbare offerte-/foto-bestanden).
    let geuploaded = 0
    const fouten: string[] = []
    for (const f of files) {
      try {
        const bytes = new Uint8Array(await f.arrayBuffer())
        const res = await appGraphFetch(`/drives/${driveId}/items/${itemId}:/${encodeURIComponent(f.name)}:/content`, {
          method: 'PUT',
          headers: { 'Content-Type': f.type || 'application/octet-stream' },
          body: bytes,
        })
        if (res.ok) geuploaded++
        else fouten.push(`${f.name} (${res.status})`)
      } catch (e) {
        fouten.push(`${f.name}: ${netteFout(e)}`)
      }
    }

    return {
      ok: fouten.length === 0,
      geuploaded,
      mapUrl,
      fout: fouten.length ? `Niet geüpload: ${fouten.join(', ')}` : undefined,
    }
  } catch (err) {
    return { ok: false, geuploaded: 0, fout: netteFout(err) }
  }
}

/**
 * Upload één of meer in-memory buffers (bv. offerte-PDF, .eml) naar de SharePoint-
 * dossiermap. Server-to-server variant van uploadDossierBestandenNaarSharePoint;
 * maakt de map zo nodig aan en cachet hem op het dossier. Gooit nooit.
 */
export async function uploadBuffersNaarDossierMap(
  dossierId: string,
  bestanden: { naam: string; contentType: string; bytes: Uint8Array }[],
): Promise<UploadResultaat> {
  const envValue = process.env.O365_DOSSIER_DRIVE_ID
  if (!envValue) return { ok: false, geuploaded: 0, fout: 'SharePoint niet geconfigureerd (O365_DOSSIER_DRIVE_ID).' }
  if (bestanden.length === 0) return { ok: true, geuploaded: 0 }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createAdminClient() as any
    const { data: dossier } = await supabase.from('dossiers').select(SELECT).eq('id', dossierId).single()
    const d = dossier as DossierRij | null
    if (!d) return { ok: false, geuploaded: 0, fout: 'Dossier niet gevonden.' }

    const ctx = await resolveDriveContext(envValue)
    if (!ctx) return { ok: false, geuploaded: 0, fout: 'Kon O365_DOSSIER_DRIVE_ID niet herleiden naar een drive/map.' }

    let driveId = d.sharepoint_drive_id
    let itemId = d.sharepoint_item_id
    let mapUrl = d.sharepoint_web_url
    if (!(d.sharepoint_match_status === 'gematcht' && driveId && itemId)) {
      const map = await bepaalOfMaakDossierMap(ctx, d)
      driveId = map.driveId; itemId = map.itemId; mapUrl = map.webUrl
      await supabase.from('dossiers').update({
        sharepoint_drive_id: driveId,
        sharepoint_item_id: itemId,
        sharepoint_web_url: mapUrl,
        sharepoint_match_status: 'gematcht',
      }).eq('id', dossierId)
    }

    let geuploaded = 0
    const fouten: string[] = []
    const geplaatst: NonNullable<UploadResultaat['bestanden']> = []
    for (const b of bestanden) {
      try {
        const res = await appGraphFetch(`/drives/${driveId}/items/${itemId}:/${encodeURIComponent(b.naam)}:/content`, {
          method: 'PUT',
          headers: { 'Content-Type': b.contentType || 'application/octet-stream' },
          body: b.bytes as unknown as BodyInit,
        })
        if (res.ok) {
          geuploaded++
          // Graph geeft het aangemaakte driveItem terug; best-effort uitlezen zodat
          // een onverwacht antwoord de upload niet alsnog laat "mislukken".
          try {
            const item = await res.json()
            geplaatst.push({
              naam: b.naam,
              driveId: item?.parentReference?.driveId ?? driveId ?? null,
              itemId: item?.id ?? null,
              webUrl: item?.webUrl ?? null,
            })
          } catch {
            geplaatst.push({ naam: b.naam, driveId: driveId ?? null, itemId: null, webUrl: null })
          }
        }
        else fouten.push(`${b.naam} (${res.status})`)
      } catch (e) {
        fouten.push(`${b.naam}: ${netteFout(e)}`)
      }
    }

    return {
      ok: fouten.length === 0,
      geuploaded,
      mapUrl,
      bestanden: geplaatst,
      fout: fouten.length ? `Niet geüpload: ${fouten.join(', ')}` : undefined,
    }
  } catch (err) {
    return { ok: false, geuploaded: 0, fout: netteFout(err) }
  }
}
