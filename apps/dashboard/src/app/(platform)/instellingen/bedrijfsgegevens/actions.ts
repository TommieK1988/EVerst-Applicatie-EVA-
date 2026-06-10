'use server'

import { createClient } from '@everts/database/server'
import type { Bedrijfsgegevens } from '@everts/database'
import { revalidatePath } from 'next/cache'

export type LoadResult =
  | { ok: true; data: Bedrijfsgegevens | null; werkmaatschappijen: Bedrijfsgegevens[] }
  | { ok: false; error: string; missingTable?: boolean }

export type LoadSingleResult =
  | { ok: true; data: Bedrijfsgegevens; parent: Bedrijfsgegevens | null }
  | { ok: false; error: string }

/**
 * Laad de organisatie + alle werkmaatschappijen.
 */
export async function loadBedrijfsgegevens(): Promise<LoadResult> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('bedrijfsgegevens')
    .select('*')
    .order('type', { ascending: true }) // organisatie eerst

  if (error) {
    const missingTable = isMissingTableError(error)
    return { ok: false, error: error.message, missingTable }
  }

  const rows = (data ?? []) as Bedrijfsgegevens[]
  const organisatie = rows.find((r) => r.type === 'organisatie') ?? null
  const werkmaatschappijen = rows.filter((r) => r.type === 'werkmaatschappij')

  return { ok: true, data: organisatie, werkmaatschappijen }
}

/**
 * Laad één bedrijf op ID, inclusief z'n parent (organisatie) voor fallback.
 */
export async function loadBedrijfById(id: string): Promise<LoadSingleResult> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('bedrijfsgegevens')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'Niet gevonden.' }

  const bedrijf = data as Bedrijfsgegevens
  let parent: Bedrijfsgegevens | null = null

  if (bedrijf.parent_id) {
    const { data: parentData } = await supabase
      .from('bedrijfsgegevens')
      .select('*')
      .eq('id', bedrijf.parent_id)
      .maybeSingle()
    parent = parentData as Bedrijfsgegevens | null
  }

  return { ok: true, data: bedrijf, parent }
}

export type SaveResult =
  | { ok: true }
  | { ok: false; error: string; missingTable?: boolean }

export async function saveBedrijfsgegevens(formData: FormData): Promise<SaveResult> {
  const naam = (formData.get('naam') as string || '').trim()
  if (!naam) return { ok: false, error: 'Bedrijfsnaam is verplicht.' }

  const payload = {
    naam,
    code:           emptyAsNull(formData.get('code')),
    kvk_nummer:     emptyAsNull(formData.get('kvk_nummer')),
    btw_nummer:     emptyAsNull(formData.get('btw_nummer')),
    iban:           emptyAsNull(formData.get('iban')),
    adres_straat:   emptyAsNull(formData.get('adres_straat')),
    adres_postcode: emptyAsNull(formData.get('adres_postcode')),
    adres_plaats:   emptyAsNull(formData.get('adres_plaats')),
    adres_land:     emptyAsNull(formData.get('adres_land')) ?? 'Nederland',
    telefoon:       emptyAsNull(formData.get('telefoon')),
    email:          emptyAsNull(formData.get('email')),
    website:        emptyAsNull(formData.get('website')),
    logo_url:       emptyAsNull(formData.get('logo_url')),
  }

  const supabase = await createClient()
  const existingId = (formData.get('id') as string) || null
  const type = (formData.get('type') as string) || 'organisatie'
  const parentId = emptyAsNull(formData.get('parent_id'))

  const query = existingId
    ? supabase.from('bedrijfsgegevens').update(payload).eq('id', existingId)
    : supabase.from('bedrijfsgegevens').insert({ ...payload, type: type as 'organisatie' | 'werkmaatschappij', parent_id: parentId })

  const { error } = await query

  if (error) {
    const missingTable = isMissingTableError(error)
    return { ok: false, error: error.message, missingTable }
  }

  revalidatePath('/instellingen/bedrijfsgegevens')
  return { ok: true }
}

/**
 * Maak een nieuwe werkmaatschappij aan onder de organisatie.
 */
export async function createWerkmaatschappij(formData: FormData): Promise<SaveResult> {
  const naam = (formData.get('naam') as string || '').trim()
  if (!naam) return { ok: false, error: 'Naam is verplicht.' }

  const parentId = formData.get('parent_id') as string
  if (!parentId) return { ok: false, error: 'Organisatie-ID ontbreekt.' }

  const supabase = await createClient()
  const { error } = await supabase.from('bedrijfsgegevens').insert({
    type: 'werkmaatschappij',
    parent_id: parentId,
    naam,
    code: emptyAsNull(formData.get('code')),
    adres_land: 'Nederland',
    kleur_primair: '#009439',
  })

  if (error) return { ok: false, error: error.message }
  revalidatePath('/instellingen/bedrijfsgegevens')
  return { ok: true }
}

function isMissingTableError(error: { code?: string; message?: string }): boolean {
  if (!error) return false
  if (error.code === '42P01' || error.code === 'PGRST205') return true
  const m = error.message ?? ''
  return /relation .* does not exist/i.test(m) || /could not find the table/i.test(m) || /not found in the schema cache/i.test(m)
}

function emptyAsNull(v: FormDataEntryValue | null): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s === '' ? null : s
}
