import 'server-only'
import { createAdminClient } from '@everts/database/server'
import { volledigeNaam } from './data'
import type { MaterieelDocument, MaterieelDocumentRij } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

/** Bucket is privé; alles wordt getoond via kortstondige signed URLs. */
export const MATERIEEL_BUCKET = 'materieel-bestanden'

/** Hoe lang een signed URL geldig is. Pagina's zijn force-dynamic, dus elke
 *  render levert verse links — een uur is ruim zat en beperkt lekken. */
const SIGNED_URL_TTL = 60 * 60

type MedewerkerNaam = { id: string; voornaam: string | null; tussenvoegsel: string | null; achternaam: string | null }

/**
 * Zet storage-paden om naar signed URLs. Eén batch-call i.p.v. één per pad,
 * zodat een lijst met 100 objecten geen 100 rondjes naar Supabase doet.
 */
export async function signPaden(paden: string[]): Promise<Map<string, string>> {
  const uniek = [...new Set(paden.filter(Boolean))]
  const uit = new Map<string, string>()
  if (uniek.length === 0) return uit

  const { data, error } = await db().storage
    .from(MATERIEEL_BUCKET)
    .createSignedUrls(uniek, SIGNED_URL_TTL)

  if (error || !data) return uit
  ;(data as { path: string | null; signedUrl: string | null }[]).forEach((d) => {
    if (d.path && d.signedUrl) uit.set(d.path, d.signedUrl)
  })
  return uit
}

/** Eén pad ondertekenen (of null als er geen pad is). */
export async function signPad(pad: string | null): Promise<string | null> {
  if (!pad) return null
  const map = await signPaden([pad])
  return map.get(pad) ?? null
}

/** Alle documenten van een object, met signed URL en uploader-naam. */
export async function getDocumenten(objectId: string, hoofdfotoPad: string | null): Promise<MaterieelDocumentRij[]> {
  const client = db()
  const { data } = await client
    .from('materieel_documenten')
    .select('id, object_id, type, bestandsnaam, storage_path, grootte, mimetype, geupload_at, geupload_door')
    .eq('object_id', objectId)
    .order('geupload_at', { ascending: false })

  const docs = (data ?? []) as MaterieelDocument[]
  if (docs.length === 0) return []

  const doorIds = [...new Set(docs.map((d) => d.geupload_door).filter(Boolean))] as string[]
  const [urls, mwRes] = await Promise.all([
    signPaden(docs.map((d) => d.storage_path)),
    doorIds.length > 0
      ? client.from('medewerkers').select('id, voornaam, tussenvoegsel, achternaam').in('id', doorIds)
      : Promise.resolve({ data: [] }),
  ])

  const naam = new Map<string, string>()
  ;((mwRes.data ?? []) as MedewerkerNaam[]).forEach((m) => naam.set(m.id, volledigeNaam(m)))

  return docs.map((d) => ({
    ...d,
    url: urls.get(d.storage_path) ?? null,
    door_naam: d.geupload_door ? naam.get(d.geupload_door) ?? null : null,
    is_hoofdfoto: !!hoofdfotoPad && d.storage_path === hoofdfotoPad,
  }))
}
