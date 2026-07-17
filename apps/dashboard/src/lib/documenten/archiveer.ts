/**
 * archiveer.ts
 *
 * Zet een gegenereerd document in de SharePoint-dossiermap en registreert het in
 * `dossier_documenten`. Beide stappen zijn best-effort: een document dat de
 * gebruiker al in handen heeft, mag nooit alsnog stuklopen op archivering.
 *
 * Het bestand zelf leeft alleen in SharePoint; de tabel is de index (wie/wanneer/
 * welke invoer) en maakt "opnieuw opstellen met dezelfde invoer" mogelijk.
 */

import 'server-only'
import { uploadBuffersNaarDossierMap } from '../o365/dossier-map'
import type { DocumentSjabloon } from './types'

export interface ArchiveerArgs {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
  dossierId: string
  sjabloon: DocumentSjabloon
  invoer: Record<string, unknown>
  bestandsnaam: string
  bytes: Uint8Array
  /** MIME-type van `bytes`. Default PDF; Word gebruikt het docx-type. */
  contentType?: string
  medewerkerId: string | null
  /** False = alleen registreren, niet naar SharePoint. */
  archiveren: boolean
}

export interface ArchiveerResultaat {
  ok: boolean
  fout?: string
  documentId?: string
  webUrl?: string | null
}

export async function archiveerEnRegistreer(args: ArchiveerArgs): Promise<ArchiveerResultaat> {
  const { supabase, dossierId, sjabloon, invoer, bestandsnaam, bytes, medewerkerId, archiveren } = args
  const contentType = args.contentType ?? 'application/pdf'

  let webUrl: string | null = null
  let driveId: string | null = null
  let itemId: string | null = null
  let fout: string | undefined

  if (archiveren) {
    try {
      const res = await uploadBuffersNaarDossierMap(dossierId, [
        { naam: bestandsnaam, contentType, bytes },
      ])
      if (!res.ok) fout = res.fout
      const geplaatst = res.bestanden?.[0]
      webUrl = geplaatst?.webUrl ?? res.mapUrl ?? null
      driveId = geplaatst?.driveId ?? null
      itemId = geplaatst?.itemId ?? null
    } catch (e) {
      fout = e instanceof Error ? e.message : 'Archiveren mislukt'
    }
  }

  // Registreren gebeurt óók als archiveren mislukte of overgeslagen is: het feit
  // dát het document is opgesteld (en met welke invoer) is de waarde.
  let documentId: string | undefined
  try {
    const { data } = await supabase
      .from('dossier_documenten')
      .insert({
        dossier_id: dossierId,
        sjabloon_id: sjabloon.id,
        documentsoort: sjabloon.documentsoort,
        bestandsnaam,
        invoer,
        sharepoint_drive_id: driveId,
        sharepoint_item_id: itemId,
        sharepoint_web_url: webUrl,
        gegenereerd_door: medewerkerId,
      })
      .select('id')
      .maybeSingle()
    documentId = data?.id
  } catch (e) {
    console.warn('Document registreren mislukt:', e)
  }

  return { ok: !fout, fout, documentId, webUrl }
}

/** Markeert een geregistreerd document als gemaild. Best-effort. */
export async function markeerGemaild(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  documentId: string,
  ontvangers: string[],
): Promise<void> {
  try {
    await supabase
      .from('dossier_documenten')
      .update({ gemaild_op: new Date().toISOString(), gemaild_naar: ontvangers })
      .eq('id', documentId)
  } catch (e) {
    console.warn('Mailstatus bijwerken mislukt:', e)
  }
}
