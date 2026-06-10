'use server'

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import type { Particulier } from '@everts/database'

type ActionResult = { ok: true } | { ok: false; error: string }

export async function getAlleParticulieren(): Promise<Particulier[]> {
  const supabase = createAdminClient() as any
  const { data } = await supabase
    .from('particulieren')
    .select('*')
    .order('achternaam')
  return data ?? []
}

export async function getParticulierById(id: string): Promise<Particulier | null> {
  const supabase = createAdminClient() as any
  const { data } = await supabase
    .from('particulieren')
    .select('*')
    .eq('id', id)
    .single()
  return (data ?? null) as Particulier | null
}

export async function createParticulier(input: {
  voornaam: string
  tussenvoegsel?: string | null
  achternaam: string
  email?: string | null
  telefoon?: string | null
  mobiel?: string | null
  adres_straat?: string | null
  adres_postcode?: string | null
  adres_plaats?: string | null
  adres_land?: string | null
  geboortedatum?: string | null
  opmerkingen?: string | null
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const supabase = createAdminClient() as any
  const { data, error } = await supabase
    .from('particulieren')
    .insert({ ...input, actief: true })
    .select('id')
    .single()

  if (error) return { ok: false, error: error.message }
  revalidatePath('/relaties')
  return { ok: true, id: data.id }
}

export async function updateParticulier(
  id: string,
  patch: {
    voornaam?: string
    tussenvoegsel?: string | null
    achternaam?: string
    email?: string | null
    telefoon?: string | null
    mobiel?: string | null
    adres_straat?: string | null
    adres_postcode?: string | null
    adres_plaats?: string | null
    adres_land?: string | null
    geboortedatum?: string | null
    opmerkingen?: string | null
  }
): Promise<ActionResult> {
  const supabase = createAdminClient() as any
  const { error } = await supabase
    .from('particulieren')
    .update(patch)
    .eq('id', id)

  if (error) return { ok: false, error: error.message }
  revalidatePath(`/relaties/particulieren/${id}`)
  return { ok: true }
}

export async function toggleParticulierActief(
  id: string,
  actief: boolean
): Promise<ActionResult> {
  const supabase = createAdminClient() as any
  const { error } = await supabase
    .from('particulieren')
    .update({ actief })
    .eq('id', id)

  if (error) return { ok: false, error: error.message }
  revalidatePath(`/relaties/particulieren/${id}`)
  revalidatePath('/relaties')
  return { ok: true }
}
