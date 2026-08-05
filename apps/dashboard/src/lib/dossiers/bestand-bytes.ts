/**
 * bestand-bytes.ts
 *
 * Eén plek om de ruwe bytes van een dossierbestand op te halen, ongeacht of het in
 * Bouw7 of in SharePoint staat. De bestandenlijst voegt beide bronnen samen, dus de
 * galerij, de lightbox en de MSG-lezer moeten allemaal met één bron-aanduiding uit
 * de voeten kunnen.
 *
 * Beide bronnen vragen om een servertoken (Bouw7 een Bearer-token, SharePoint een
 * app-only Graph-token), dus een kale link naar het bestand bestaat niet — het loopt
 * altijd via een EVA-route die eerst de rechten controleert.
 */

import { getBouw7Client } from '@/lib/bouw7/sync'
import { appGraphFetch } from '@/lib/o365/graph'
import { resolveDriveContext } from '@/lib/o365/sharepoint'

export type BestandBron =
  | { bron: 'bouw7'; hash: string | null; id: string | null }
  | { bron: 'sharepoint'; driveId: string; itemId: string }

export type BestandBytes = {
  data: Buffer
  contentType: string | null
  fileName: string | null
}

export class BestandFoutError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = 'BestandFoutError'
  }
}

/** Leest de bron-aanduiding uit de querystring van een route. */
export function bronUitQuery(params: URLSearchParams): BestandBron | null {
  const bron = params.get('bron')

  if (bron === 'sharepoint') {
    const driveId = params.get('driveId')
    const itemId = params.get('itemId')
    if (!driveId || !itemId) return null
    return { bron: 'sharepoint', driveId, itemId }
  }

  if (bron === 'bouw7') {
    const hash = params.get('hash')
    const id = params.get('id')
    if (!hash && !id) return null
    return { bron: 'bouw7', hash, id }
  }

  return null
}

async function haalBouw7(b: Extract<BestandBron, { bron: 'bouw7' }>): Promise<BestandBytes> {
  const client = await getBouw7Client()

  // Primair de storage-hash; lukt dat niet, dan het project-file-id. Dezelfde
  // volgorde als de bestaande downloadproxy.
  const paden: string[] = []
  if (b.hash && b.hash !== '-') paden.push(`/storage/${encodeURIComponent(b.hash)}/download`)
  if (b.id) paden.push(`/project/file/${encodeURIComponent(b.id)}`)

  let laatsteFout = 'onbekende fout'
  for (const pad of paden) {
    try {
      const { data, contentType, fileName } = await client.getBinary(pad)
      return { data: Buffer.from(data), contentType, fileName }
    } catch (e) {
      laatsteFout = e instanceof Error ? e.message : 'onbekende fout'
    }
  }
  throw new BestandFoutError(`Ophalen uit Bouw7 mislukt: ${laatsteFout}`, 502)
}

async function haalSharePoint(b: Extract<BestandBron, { bron: 'sharepoint' }>): Promise<BestandBytes> {
  // De driveId komt van de client. Zonder deze controle zou de route elk bestand in
  // elke drive waar EVA bij kan kunnen uitleveren — beperk hem tot de dossiercontainer.
  const envValue = process.env.O365_DOSSIER_DRIVE_ID
  if (!envValue) throw new BestandFoutError('SharePoint is niet geconfigureerd.', 503)

  const ctx = await resolveDriveContext(envValue)
  if (!ctx) throw new BestandFoutError('Kon de dossierbibliotheek niet bereiken.', 502)
  if (b.driveId !== ctx.driveId) {
    throw new BestandFoutError('Dit bestand hoort niet bij de ingestelde dossierbibliotheek.', 403)
  }

  const res = await appGraphFetch(
    `/drives/${encodeURIComponent(b.driveId)}/items/${encodeURIComponent(b.itemId)}/content`,
  )
  if (!res.ok) throw new BestandFoutError(`Ophalen uit SharePoint mislukt (${res.status}).`, 502)

  const cd = res.headers.get('content-disposition')
  const m = cd?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)
  return {
    data: Buffer.from(await res.arrayBuffer()),
    contentType: res.headers.get('content-type'),
    fileName: m?.[1] ? decodeURIComponent(m[1]) : null,
  }
}

export function haalBestandBytes(bron: BestandBron): Promise<BestandBytes> {
  return bron.bron === 'bouw7' ? haalBouw7(bron) : haalSharePoint(bron)
}
