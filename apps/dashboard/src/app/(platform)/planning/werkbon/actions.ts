'use server'

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

export async function startWerkbon(
  planning_item_id: string,
): Promise<{ ok: true; werkbon_id: string } | { ok: false; error: string }> {
  const supabase = db()

  // Controleer of er al een actieve werkbon is
  const { data: bestaand } = await supabase
    .from('werkbonnen')
    .select('id')
    .eq('planning_item_id', planning_item_id)
    .is('klaar_gemeld_op', null)
    .maybeSingle()

  if (bestaand) return { ok: true, werkbon_id: bestaand.id }

  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('werkbonnen')
    .insert({
      planning_item_id,
      start_dt: now,
      eind_dt:  now, // placeholder, wordt bijgewerkt bij sluiten
    })
    .select('id')
    .single()

  if (error) return { ok: false, error: error.message }

  revalidatePath('/planning/mijn-werkbonnen')
  return { ok: true, werkbon_id: data.id }
}

export async function uploadWerkbonFoto(
  werkbon_id: string,
  formData: FormData,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const supabase = db()
  const file = formData.get('foto') as File | null
  if (!file) return { ok: false, error: 'Geen bestand meegegeven' }

  const ext = file.name.split('.').pop() ?? 'jpg'
  const path = `werkbon-fotos/${werkbon_id}/${Date.now()}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadErr } = await supabase.storage
    .from('werkbon-fotos')
    .upload(path, buffer, { contentType: file.type, upsert: false })

  if (uploadErr) return { ok: false, error: uploadErr.message }

  const { data: urlData } = supabase.storage.from('werkbon-fotos').getPublicUrl(path)

  await supabase.from('werkbon_fotos').insert({
    werkbon_id,
    storage_url: urlData.publicUrl,
    gemaakt_op:  new Date().toISOString(),
  })

  return { ok: true, url: urlData.publicUrl }
}

export async function sluitWerkbon(
  werkbon_id: string,
  input: {
    opmerking:       string
    handtekening_b64: string | null
    gewerkte_uren:   number
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = db()
  const now = new Date().toISOString()

  // Upload handtekening indien aanwezig
  let handtekeningUrl: string | null = null
  if (input.handtekening_b64) {
    const base64Data = input.handtekening_b64.replace(/^data:image\/\w+;base64,/, '')
    const buffer = Buffer.from(base64Data, 'base64')
    const path = `werkbon-fotos/handtekeningen/${werkbon_id}.png`
    const { error: uploadErr } = await supabase.storage
      .from('werkbon-fotos')
      .upload(path, buffer, { contentType: 'image/png', upsert: true })

    if (!uploadErr) {
      const { data } = supabase.storage.from('werkbon-fotos').getPublicUrl(path)
      handtekeningUrl = data.publicUrl
    }
  }

  // Haal werkbon + item-info op
  const { data: werkbon, error: wbErr } = await supabase
    .from('werkbonnen')
    .select('planning_item_id, start_dt')
    .eq('id', werkbon_id)
    .single()

  if (wbErr) return { ok: false, error: wbErr.message }

  const { data: item, error: itemErr } = await supabase
    .from('planning_items')
    .select('medewerker_id, planning_activiteiten ( dossier_id, uursoort_id )')
    .eq('id', werkbon.planning_item_id)
    .single()

  if (itemErr) return { ok: false, error: itemErr.message }

  const activiteit = (item as any).planning_activiteiten

  // Update werkbon
  const { error: updateErr } = await supabase
    .from('werkbonnen')
    .update({
      eind_dt:          now,
      gewerkte_uren:    input.gewerkte_uren,
      opmerking:        input.opmerking || null,
      handtekening_url: handtekeningUrl,
      klaar_gemeld_op:  now,
    })
    .eq('id', werkbon_id)

  if (updateErr) return { ok: false, error: updateErr.message }

  // Maak uren-regel aan
  await supabase.from('uren_regels').insert({
    werkbon_id,
    planning_item_id:  werkbon.planning_item_id,
    dossier_id:        activiteit?.dossier_id ?? null,
    medewerker_id:     item.medewerker_id,
    uursoort_id:       activiteit?.uursoort_id ?? null,
    datum:             now.slice(0, 10),
    uren:              input.gewerkte_uren,
  })

  revalidatePath('/planning/mijn-werkbonnen')
  revalidatePath('/planning')
  return { ok: true }
}
