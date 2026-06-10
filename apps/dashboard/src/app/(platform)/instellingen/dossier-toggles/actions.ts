'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@everts/database/server'

export interface ToggleDefinitie {
  id: string
  sleutel: string
  label: string
  volgorde: number
  actief: boolean
}

function maakSleutel(label: string): string {
  return label
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // accenten weg
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60)
}

export async function getToggleDefinities(): Promise<ToggleDefinitie[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const { data } = await supabase
    .from('dossier_toggle_definities')
    .select('*')
    .order('volgorde')
    .order('label')
  return (data ?? []) as ToggleDefinitie[]
}

export async function maakToggleDefinitie(label: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const schoon = label.trim()
  if (!schoon) return { ok: false, error: 'Label is verplicht' }
  const sleutel = maakSleutel(schoon)
  if (!sleutel) return { ok: false, error: 'Ongeldig label' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const { error } = await supabase
    .from('dossier_toggle_definities')
    .insert({ sleutel, label: schoon })
  if (error) {
    if (error.code === '23505') return { ok: false, error: 'Er bestaat al een toggle met deze naam' }
    return { ok: false, error: error.message }
  }
  revalidatePath('/instellingen/dossier-toggles')
  return { ok: true }
}

export async function setToggleDefinitieActief(id: string, actief: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const { error } = await supabase.from('dossier_toggle_definities').update({ actief }).eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/instellingen/dossier-toggles')
  return { ok: true }
}

export async function verwijderToggleDefinitie(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const { error } = await supabase.from('dossier_toggle_definities').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/instellingen/dossier-toggles')
  return { ok: true }
}
