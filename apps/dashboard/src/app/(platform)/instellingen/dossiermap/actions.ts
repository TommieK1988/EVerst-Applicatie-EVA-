'use server'

/**
 * Beheer van de voorbeeldbestanden die EVA in een nieuwe dossiermap zet.
 *
 * Elke muterende action begint met `vereisBeheerder()`. De page-guard alleen is niet
 * genoeg: een server-action is ook als kale RPC aanroepbaar, en deze schrijven met de
 * service-role.
 */

import { revalidatePath } from 'next/cache'
import { vereisBeheerder, getCurrentMedewerker } from '@/lib/auth/rechten'
import { saneerMapNaam } from '@/lib/o365/sharepoint'
import { dossierDb } from '@/lib/o365/dossier-map'
import {
  STANDAARDBESTANDEN_BUCKET,
  type StandaardbestandRegel,
} from '@/lib/o365/dossiermap-standaardbestanden'

const PAD = '/instellingen/dossiermap'

/** Bestandsnaam veilig maken voor een storage-pad. */
function veiligeNaam(naam: string): string {
  return naam
    .normalize('NFKD').replace(/[^\w.\- ]/g, '')
    .trim().replace(/\s+/g, '-')
    .slice(0, 80) || 'bestand'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function naarRegel(row: any): StandaardbestandRegel {
  return {
    ...row,
    categorie_ids: Array.isArray(row?.categorie_ids) ? row.categorie_ids : [],
    werkmaatschappij_ids: Array.isArray(row?.werkmaatschappij_ids) ? row.werkmaatschappij_ids : [],
  } as StandaardbestandRegel
}

export async function getStandaardbestanden(): Promise<StandaardbestandRegel[]> {
  await vereisBeheerder()
  const { data } = await dossierDb()
    .from('dossiermap_standaardbestanden')
    .select('*')
    .order('volgorde', { ascending: true })
    .order('bestandsnaam', { ascending: true })
  return (data ?? []).map(naarRegel)
}

/**
 * Upload een voorbeeldbestand. Het bestand gaat eerst naar de privébucket en daarna pas de
 * rij erbij; mislukt de rij, dan halen we het bestand weer weg zodat er geen wees in de
 * bucket achterblijft.
 */
export async function uploadStandaardbestand(
  formData: FormData,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await vereisBeheerder()

  const file = formData.get('bestand')
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'Kies een bestand.' }
  if (file.size > 20 * 1024 * 1024) return { ok: false, error: 'Het bestand is groter dan 20 MB.' }

  const supabase = dossierDb()
  const medewerker = await getCurrentMedewerker()

  const submapRuw = String(formData.get('submap') ?? '').trim()
  // Eén niveau diep: een pad met scheidingstekens zou buiten de dossiermap kunnen wijzen.
  const submap = submapRuw ? saneerMapNaam(submapRuw.replace(/[\\/]/g, ' ')) || null : null

  const bestandsnaam = String(formData.get('bestandsnaam') ?? '').trim() || file.name
  const naam = String(formData.get('naam') ?? '').trim() || bestandsnaam

  const pad = `${Date.now()}-${veiligeNaam(file.name)}`
  const bytes = new Uint8Array(await file.arrayBuffer())

  const { error: upErr } = await supabase.storage
    .from(STANDAARDBESTANDEN_BUCKET)
    .upload(pad, bytes, { contentType: file.type || 'application/octet-stream', upsert: false })
  if (upErr) return { ok: false, error: 'Uploaden mislukt.' }

  const { data, error } = await supabase
    .from('dossiermap_standaardbestanden')
    .insert({
      naam,
      bestandsnaam,
      submap,
      storage_path: pad,
      content_type: file.type || null,
      grootte: file.size,
      aangemaakt_door: medewerker?.auth_user_id ?? null,
    })
    .select('id')
    .single()

  if (error || !data) {
    await supabase.storage.from(STANDAARDBESTANDEN_BUCKET).remove([pad])
    return { ok: false, error: 'Opslaan mislukt.' }
  }

  revalidatePath(PAD)
  return { ok: true, id: data.id as string }
}

/** Bewerkbare velden van een regel. Het bestand zelf vervang je door een nieuwe regel. */
export async function updateStandaardbestand(
  id: string,
  velden: {
    naam?: string
    bestandsnaam?: string
    submap?: string | null
    categorie_ids?: number[]
    werkmaatschappij_ids?: string[]
    actief?: boolean
    volgorde?: number
  },
): Promise<{ ok: boolean; error?: string }> {
  await vereisBeheerder()

  const schoon: Record<string, unknown> = { ...velden }
  if (velden.submap !== undefined) {
    const s = (velden.submap ?? '').trim()
    schoon.submap = s ? saneerMapNaam(s.replace(/[\\/]/g, ' ')) || null : null
  }
  if (velden.bestandsnaam !== undefined && !velden.bestandsnaam.trim()) delete schoon.bestandsnaam

  const { error } = await dossierDb().from('dossiermap_standaardbestanden').update(schoon).eq('id', id)
  if (error) return { ok: false, error: 'Opslaan mislukt.' }

  revalidatePath(PAD)
  return { ok: true }
}

/** Haalt de regel én het bestand weg. */
export async function verwijderStandaardbestand(id: string): Promise<{ ok: boolean; error?: string }> {
  await vereisBeheerder()

  const supabase = dossierDb()
  const { data } = await supabase
    .from('dossiermap_standaardbestanden')
    .select('storage_path')
    .eq('id', id)
    .maybeSingle()

  const { error } = await supabase.from('dossiermap_standaardbestanden').delete().eq('id', id)
  if (error) return { ok: false, error: 'Verwijderen mislukt.' }

  if (data?.storage_path) {
    await supabase.storage.from(STANDAARDBESTANDEN_BUCKET).remove([data.storage_path])
  }

  revalidatePath(PAD)
  return { ok: true }
}

/**
 * Kortlevende link om het voorbeeldbestand te bekijken. De bucket is privé, dus een
 * publieke URL bestaat niet.
 */
export async function getStandaardbestandUrl(id: string): Promise<string | null> {
  await vereisBeheerder()

  const supabase = dossierDb()
  const { data } = await supabase
    .from('dossiermap_standaardbestanden')
    .select('storage_path')
    .eq('id', id)
    .maybeSingle()
  if (!data?.storage_path) return null

  const { data: url } = await supabase.storage
    .from(STANDAARDBESTANDEN_BUCKET)
    .createSignedUrl(data.storage_path, 300)
  return url?.signedUrl ?? null
}

/** Werkmaatschappijen voor de filterkiezer. */
export async function getWerkmaatschappijen(): Promise<{ id: string; naam: string }[]> {
  await vereisBeheerder()
  const { data } = await dossierDb()
    .from('bedrijfsgegevens')
    .select('id, naam')
    .eq('type', 'werkmaatschappij')
    .order('naam')
  return (data ?? []) as { id: string; naam: string }[]
}
