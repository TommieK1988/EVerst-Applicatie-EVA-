/**
 * template-dupliceren.ts
 *
 * Dupliceert de bestanden die aan een documentsjabloon (of offerte-layout) hangen:
 * het Word-template en het briefpapier-PDF.
 *
 * Waarom: een rij kopiëren met `...rest` neemt ook `docx_template_*` mee. Bij een
 * SharePoint/OneDrive-koppeling wijzen origineel en kopie dan naar hetzelfde
 * driveItem — "Bewerken in Word Online" past dus béide sjablonen tegelijk aan.
 * Een kopie moet een eigen bestand hebben.
 *
 * Twee soorten verwijzingen, elk met eigen duplicatie:
 *  - bucket      → object kopiëren binnen Supabase Storage (`docx-templates`)
 *  - sharepoint/ → driveItem downloaden en als nieuw bestand in dezelfde map
 *    onedrive       terugzetten (app-only Graph, zelfde pad-upload als elders)
 *
 * Gedeeld door `document_sjablonen` en `quote_layouts`: die kolommen zijn identiek
 * en de bestanden staan in dezelfde bucket.
 */

import { createAdminClient } from '@everts/database/server'
import { appGraphFetch, appGraphGet, appGraphGetRaw, GraphError } from '@/lib/o365/graph'
import { saneerMapNaam } from '@/lib/o365/sharepoint'

const BUCKET = 'docx-templates'
const DOCX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

/** Boven deze grootte weigert Graph de simpele PUT en moet het via een upload-sessie. */
const SIMPELE_UPLOAD_MAX = 4 * 1024 * 1024
/** Graph adviseert chunks tot 60 MiB; één PUT van de hele sessie is daaronder prima. */
const SESSIE_UPLOAD_MAX = 60 * 1024 * 1024

/** De template-kolommen zoals ze op `document_sjablonen` én `quote_layouts` staan. */
export interface TemplateVerwijzing {
  docx_template_url?: string | null
  docx_template_bron?: string | null
  docx_template_drive_id?: string | null
  docx_template_item_id?: string | null
  docx_template_web_url?: string | null
  briefpapier_pdf_url?: string | null
}

export interface DuplicatieResultaat {
  /** Kolommen om op de kopie te zetten. Leeg = de bron had geen bestanden. */
  velden: TemplateVerwijzing
  /** Gevuld wanneer het dupliceren (deels) mislukte; de kopie is dan template-loos. */
  waarschuwing: string | null
}

interface DriveItem {
  id: string
  name?: string
  webUrl?: string
  parentReference?: { driveId?: string; id?: string }
}

/**
 * Maakt eigen kopieën van het Word-template en briefpapier van `bron`.
 *
 * Faalt het dupliceren, dan komen de betreffende kolommen NIET in `velden` te
 * staan: liever een kopie zonder template dan twee sjablonen op één bestand.
 */
export async function dupliceerTemplateBestanden(
  bron: TemplateVerwijzing,
  doelId: string,
  doelNaam: string,
): Promise<DuplicatieResultaat> {
  const velden: TemplateVerwijzing = {}
  const problemen: string[] = []

  const isGraph = bron.docx_template_bron === 'sharepoint' || bron.docx_template_bron === 'onedrive'

  if (isGraph && bron.docx_template_drive_id && bron.docx_template_item_id) {
    try {
      const nieuw = await dupliceerGraphItem(
        bron.docx_template_drive_id,
        bron.docx_template_item_id,
        doelNaam,
      )
      velden.docx_template_bron = bron.docx_template_bron
      velden.docx_template_drive_id = nieuw.drive_id
      velden.docx_template_item_id = nieuw.item_id
      velden.docx_template_web_url = nieuw.web_url
    } catch (err) {
      console.error('Word-template dupliceren (Graph) mislukt:', err)
      problemen.push('het Word-template in SharePoint/OneDrive')
    }
  } else if (bron.docx_template_url) {
    try {
      const url = await kopieerBucketBestand(bron.docx_template_url, doelId)
      velden.docx_template_url = url
      velden.docx_template_bron = bron.docx_template_bron ?? 'bucket'
    } catch (err) {
      console.error('Word-template dupliceren (bucket) mislukt:', err)
      problemen.push('het Word-template')
    }
  }

  if (bron.briefpapier_pdf_url) {
    try {
      velden.briefpapier_pdf_url = await kopieerBucketBestand(bron.briefpapier_pdf_url, doelId)
    } catch (err) {
      console.error('Briefpapier dupliceren mislukt:', err)
      problemen.push('het briefpapier')
    }
  }

  return {
    velden,
    waarschuwing: problemen.length
      ? `De kopie is aangemaakt, maar ${problemen.join(' en ')} kon niet worden gedupliceerd. Koppel of upload dat bestand zelf — zo blijft het origineel ongemoeid.`
      : null,
  }
}

// ─── Supabase Storage ─────────────────────────────────────────────────────────

/**
 * Pad van een object binnen de bucket uit zijn publieke URL. `null` bij een URL die
 * niet uit deze bucket komt (extern gehost bestand — niets te kopiëren).
 */
function bucketPad(publicUrl: string): string | null {
  const marker = `/storage/v1/object/public/${BUCKET}/`
  const i = publicUrl.indexOf(marker)
  if (i === -1) return null
  const rest = publicUrl.slice(i + marker.length).split('?')[0]
  try {
    return decodeURIComponent(rest)
  } catch {
    return rest
  }
}

/**
 * Kopieert een bucket-object naar de map van het doel-id. Paden zien eruit als
 * `documenten/<sjabloonId>/<timestamp>-naam.docx`; de kopie krijgt dus hetzelfde
 * voorvoegsel, het nieuwe id en een nieuwe timestamp.
 *
 * Geeft de bron-URL terug wanneer die niet in de bucket staat.
 */
async function kopieerBucketBestand(publicUrl: string, doelId: string): Promise<string> {
  const oud = bucketPad(publicUrl)
  if (!oud) return publicUrl

  const delen = oud.split('/')
  const bestand = delen.pop() ?? 'template'
  // Middelste segment is de map per sjabloon/layout — vervangen door het nieuwe id.
  if (delen.length >= 2) delen[delen.length - 1] = doelId
  const nieuw = [...delen, `${Date.now()}-${bestand.replace(/^\d+-/, '')}`].join('/')

  const supabase = createAdminClient()
  const { error } = await supabase.storage.from(BUCKET).copy(oud, nieuw)
  if (error) throw error

  return supabase.storage.from(BUCKET).getPublicUrl(nieuw).data.publicUrl
}

// ─── Microsoft Graph ──────────────────────────────────────────────────────────

/** Bestandsnaam voor de kopie: de naam van het nieuwe sjabloon, anders "<bron> (kopie)". */
function docxBestandsnaam(doelNaam: string, bronNaam?: string | null): string {
  const basis = saneerMapNaam(doelNaam.replace(/\.docx$/i, ''))
  if (basis) return `${basis}.docx`
  const bron = saneerMapNaam((bronNaam ?? '').replace(/\.docx$/i, ''))
  return `${bron || 'sjabloon'} (kopie).docx`
}

/**
 * Zet een nieuw bestand naast het bronbestand in dezelfde SharePoint/OneDrive-map.
 * `conflictBehavior=rename` voorkomt dat een gelijknamig bestand wordt overschreven.
 */
async function dupliceerGraphItem(
  driveId: string,
  itemId: string,
  doelNaam: string,
): Promise<{ drive_id: string; item_id: string; web_url: string | null }> {
  const item = await appGraphGet<DriveItem>(
    `/drives/${driveId}/items/${itemId}?$select=id,name,parentReference`,
  )
  const doelDrive = item.parentReference?.driveId ?? driveId
  const ouderId = item.parentReference?.id
  if (!ouderId) throw new Error('Bovenliggende map van het Word-template niet gevonden')

  const naam = docxBestandsnaam(doelNaam, item.name)
  const bytes = await appGraphGetRaw(`/drives/${driveId}/items/${itemId}/content`)
  if (bytes.length > SESSIE_UPLOAD_MAX) {
    throw new Error(`Template is te groot om te dupliceren (${bytes.length} bytes)`)
  }

  const pad = `/drives/${doelDrive}/items/${ouderId}:/${encodeURIComponent(naam)}:`
  const nieuw =
    bytes.length > SIMPELE_UPLOAD_MAX
      ? await uploadViaSessie(pad, bytes)
      : await uploadSimpel(pad, bytes)

  return {
    drive_id: nieuw.parentReference?.driveId ?? doelDrive,
    item_id: nieuw.id,
    web_url: nieuw.webUrl ?? null,
  }
}

async function uploadSimpel(pad: string, bytes: Buffer): Promise<DriveItem> {
  const res = await appGraphFetch(`${pad}/content?@microsoft.graph.conflictBehavior=rename`, {
    method: 'PUT',
    headers: { 'Content-Type': DOCX_CONTENT_TYPE },
    body: new Uint8Array(bytes),
  })
  if (!res.ok) throw new GraphError(res.status, `Kopie uploaden mislukt: HTTP ${res.status}`)
  return (await res.json()) as DriveItem
}

/** Grotere bestanden: sessie aanvragen en in één range wegschrijven. */
async function uploadViaSessie(pad: string, bytes: Buffer): Promise<DriveItem> {
  const sessieRes = await appGraphFetch(`${pad}/createUploadSession`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'rename' } }),
  })
  if (!sessieRes.ok) {
    throw new GraphError(sessieRes.status, `Upload-sessie mislukt: HTTP ${sessieRes.status}`)
  }
  const { uploadUrl } = (await sessieRes.json()) as { uploadUrl?: string }
  if (!uploadUrl) throw new Error('Graph gaf geen uploadUrl terug')

  // uploadUrl is pre-authenticated: géén Authorization-header meesturen.
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Length': String(bytes.length),
      'Content-Range': `bytes 0-${bytes.length - 1}/${bytes.length}`,
    },
    body: new Uint8Array(bytes),
  })
  if (!res.ok) throw new GraphError(res.status, `Kopie uploaden mislukt: HTTP ${res.status}`)
  return (await res.json()) as DriveItem
}
