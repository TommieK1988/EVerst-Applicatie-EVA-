/**
 * o365/docx-to-pdf.ts
 *
 * Converteert een ingevuld .docx naar PDF via Microsoft Graph — Word's eigen
 * renderer, dus pixel-perfecte getrouwheid van het Word-ontwerp.
 *
 * Flow (app-only, gedeelde drive `O365_PDF_DRIVE_ID`):
 *   1. tijdelijk .docx uploaden
 *   2. GET .../content?format=pdf  → PDF-bytes
 *   3. tijdelijk bestand verwijderen (ook bij fout)
 */

import { appGraphFetch, appGraphGetRaw, GraphError } from './graph'

const DOCX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

/**
 * Converteert een .docx-buffer naar een PDF-buffer via Microsoft Graph.
 *
 * @throws Error wanneer `O365_PDF_DRIVE_ID` ontbreekt of de Graph-conversie faalt.
 */
export async function convertDocxToPdf(docxBuffer: Buffer): Promise<Buffer> {
  const driveId = process.env.O365_PDF_DRIVE_ID
  if (!driveId) {
    throw new Error('O365_PDF_DRIVE_ID ontbreekt — PDF-conversie via Graph niet geconfigureerd.')
  }

  const tempNaam = `eva-temp/${crypto.randomUUID()}.docx`
  const uploadPath = `/drives/${driveId}/root:/${tempNaam}:/content`

  // 1. Tijdelijk uploaden (pad-gebaseerde upload maakt de map zo nodig aan)
  const uploadRes = await appGraphFetch(uploadPath, {
    method: 'PUT',
    headers: { 'Content-Type': DOCX_CONTENT_TYPE },
    body: new Uint8Array(docxBuffer),
  })
  if (!uploadRes.ok) {
    throw new GraphError(uploadRes.status, `Temp-upload mislukt: HTTP ${uploadRes.status}`)
  }
  const item = (await uploadRes.json()) as { id: string }
  const itemId = item.id

  try {
    // 2. Converteren naar PDF (volgt 302 → pre-authenticated download-URL)
    return await appGraphGetRaw(`/drives/${driveId}/items/${itemId}/content?format=pdf`)
  } finally {
    // 3. Opruimen — best-effort, mag de respons niet blokkeren
    try {
      await appGraphFetch(`/drives/${driveId}/items/${itemId}`, { method: 'DELETE' })
    } catch {
      /* opruimen mislukt — niet fataal */
    }
  }
}
