'use server'

import { createAdminClient } from '@everts/database/server'
import {
  matchDossierFolder,
  listFolderChildren,
  resolveShareLink,
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
  const driveId = process.env.O365_DOSSIER_DRIVE_ID
  if (!driveId) return LEEG

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
        const m = await matchDossierFolder(
          { dossiernummer: d.dossiernummer, bouw7Id: d.bouw7_id != null ? String(d.bouw7_id) : null, titel: d.titel },
          driveId,
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
