'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@everts/database/server'
import { GeenToegangError, type CurrentMedewerker } from '@/lib/auth/rechten'
import { vereisMaterieelMutatie } from '@/lib/materieel/auth'
import { MATERIEEL_BUCKET } from '@/lib/materieel/bestanden'
import { MATERIEEL_DOCUMENT_TYPES, type MaterieelDocumentType } from '@/lib/materieel/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

type ActieResultaat<T = unknown> = { ok: true; data: T } | { ok: false; error: string }

const MAX_BYTES = 50 * 1024 * 1024

async function gate(): Promise<{ ok: true; medewerker: CurrentMedewerker } | { ok: false; error: string }> {
  try {
    return { ok: true, medewerker: await vereisMaterieelMutatie() }
  } catch (e) {
    if (e instanceof GeenToegangError) return { ok: false, error: e.message }
    throw e
  }
}

function herlaad(objectId: string) {
  revalidatePath('/materieelbeheer')
  revalidatePath(`/materieelbeheer/${objectId}`)
}

/** Bestandsnaam veilig maken voor een storage-pad. */
function veiligeNaam(naam: string): string {
  return naam
    .normalize('NFKD').replace(/[^\w.\- ]/g, '')
    .trim().replace(/\s+/g, '-')
    .slice(0, 80) || 'bestand'
}

/**
 * Foto of document uploaden. Het bestand gaat naar de private bucket; we slaan
 * het pad op (geen URL — die zou verlopen). Een afbeelding wordt automatisch de
 * hoofdfoto als er nog geen is.
 */
export async function uploadDocument(objectId: string, formData: FormData): Promise<ActieResultaat<{ id: string }>> {
  const g = await gate(); if (!g.ok) return g

  const file = formData.get('bestand') as File | null
  const ruwType = String(formData.get('type') ?? 'overig')
  if (!file || file.size === 0) return { ok: false, error: 'Geen bestand gekozen' }
  if (file.size > MAX_BYTES) return { ok: false, error: 'Bestand is groter dan 50 MB' }

  const type: MaterieelDocumentType = (MATERIEEL_DOCUMENT_TYPES as readonly string[]).includes(ruwType)
    ? (ruwType as MaterieelDocumentType)
    : 'overig'

  const client = db()
  const pad = `${objectId}/${Date.now()}-${veiligeNaam(file.name)}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: upErr } = await client.storage
    .from(MATERIEEL_BUCKET)
    .upload(pad, buffer, { contentType: file.type || 'application/octet-stream', upsert: false })
  if (upErr) return { ok: false, error: upErr.message }

  const { data, error } = await client.from('materieel_documenten').insert({
    object_id: objectId,
    type,
    bestandsnaam: file.name,
    storage_path: pad,
    grootte: file.size,
    mimetype: file.type || null,
    geupload_door: g.medewerker.id,
  }).select('id').single()

  if (error) {
    // Databaseregel mislukt → het bestand niet als wees achterlaten.
    await client.storage.from(MATERIEEL_BUCKET).remove([pad])
    return { ok: false, error: error.message }
  }

  // Eerste afbeelding wordt meteen de hoofdfoto; dat scheelt een handeling.
  if (file.type.startsWith('image/')) {
    const { data: obj } = await client
      .from('materieel_objecten').select('hoofdfoto_path').eq('id', objectId).maybeSingle()
    if (!(obj as { hoofdfoto_path: string | null } | null)?.hoofdfoto_path) {
      await client.from('materieel_objecten').update({ hoofdfoto_path: pad }).eq('id', objectId)
    }
  }

  herlaad(objectId)
  return { ok: true, data: { id: data.id as string } }
}

/** Document verwijderen — uit storage én uit de tabel. */
export async function verwijderDocument(documentId: string, objectId: string): Promise<ActieResultaat> {
  const g = await gate(); if (!g.ok) return g
  const client = db()

  const { data: doc } = await client
    .from('materieel_documenten').select('storage_path').eq('id', documentId).maybeSingle()
  const pad = (doc as { storage_path: string } | null)?.storage_path
  if (!pad) return { ok: false, error: 'Document niet gevonden' }

  const { error } = await client.from('materieel_documenten').delete().eq('id', documentId)
  if (error) return { ok: false, error: error.message }
  await client.storage.from(MATERIEEL_BUCKET).remove([pad])

  // Was dit de hoofdfoto? Dan een andere foto promoveren, anders leeghalen.
  const { data: obj } = await client
    .from('materieel_objecten').select('hoofdfoto_path').eq('id', objectId).maybeSingle()
  if ((obj as { hoofdfoto_path: string | null } | null)?.hoofdfoto_path === pad) {
    const { data: rest } = await client
      .from('materieel_documenten')
      .select('storage_path, mimetype')
      .eq('object_id', objectId)
      .order('geupload_at', { ascending: false })
    const volgende = ((rest ?? []) as { storage_path: string; mimetype: string | null }[])
      .find((r) => r.mimetype?.startsWith('image/'))
    await client.from('materieel_objecten')
      .update({ hoofdfoto_path: volgende?.storage_path ?? null }).eq('id', objectId)
  }

  herlaad(objectId)
  return { ok: true, data: null }
}

/** Een geüploade foto als hoofdfoto instellen. */
export async function zetHoofdfoto(objectId: string, documentId: string): Promise<ActieResultaat> {
  const g = await gate(); if (!g.ok) return g
  const client = db()

  const { data: doc } = await client
    .from('materieel_documenten').select('storage_path, mimetype').eq('id', documentId).maybeSingle()
  const rij = doc as { storage_path: string; mimetype: string | null } | null
  if (!rij) return { ok: false, error: 'Document niet gevonden' }
  if (!rij.mimetype?.startsWith('image/')) return { ok: false, error: 'Alleen een afbeelding kan hoofdfoto zijn' }

  const { error } = await client.from('materieel_objecten')
    .update({ hoofdfoto_path: rij.storage_path }).eq('id', objectId)
  if (error) return { ok: false, error: error.message }

  herlaad(objectId)
  return { ok: true, data: null }
}
