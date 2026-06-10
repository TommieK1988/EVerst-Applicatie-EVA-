'use server'

import { createClient } from '@everts/database/server'
import type { Bedrijfsgegevens } from '@everts/database'
import { revalidatePath } from 'next/cache'

export type LoadResult =
  | { ok: true; data: Bedrijfsgegevens | null }
  | { ok: false; error: string; missingTable?: boolean; missingColumns?: boolean }

/**
 * Laad bedrijfsgegevens voor huisstijl.
 * Als bedrijfId is opgegeven, laad die specifieke rij (werkmaatschappij).
 * Anders: laad de organisatie-rij (type = 'organisatie').
 */
export async function loadHuisstijl(bedrijfId?: string): Promise<LoadResult> {
  const supabase = await createClient()
  try {
    let query = supabase.from('bedrijfsgegevens').select('*')

    if (bedrijfId) {
      query = query.eq('id', bedrijfId)
    } else {
      query = query.eq('type', 'organisatie')
    }

    const { data, error } = await query.limit(1).maybeSingle()

    if (error) {
      if (isMissingTable(error)) return { ok: false, error: error.message, missingTable: true }
      if (isMissingColumn(error)) return { ok: false, error: error.message, missingColumns: true }
      return { ok: false, error: error.message }
    }
    return { ok: true, data: data as Bedrijfsgegevens | null }
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'Onbekende fout' }
  }
}

export type SaveResult = { ok: true } | { ok: false; error: string }

export async function saveHuisstijl(formData: FormData): Promise<SaveResult> {
  const id = formData.get('id') as string | null
  if (!id) return { ok: false, error: 'Geen bedrijfsgegevens gevonden. Sla eerst de basisgegevens op.' }

  const payload = {
    logo_primair_url:    emptyNull(formData.get('logo_primair_url')),
    logo_wit_url:        emptyNull(formData.get('logo_wit_url')),
    logo_icon_url:       emptyNull(formData.get('logo_icon_url')),
    logo_monochroom_url: emptyNull(formData.get('logo_monochroom_url')),
    kleur_primair:       emptyNull(formData.get('kleur_primair')) ?? '#009439',
    kleur_accent:        emptyNull(formData.get('kleur_accent')),
    kleur_secundair:     emptyNull(formData.get('kleur_secundair')),
    kleur_succes:        emptyNull(formData.get('kleur_succes')) ?? '#16a34a',
    kleur_waarschuwing:  emptyNull(formData.get('kleur_waarschuwing')) ?? '#eab308',
    kleur_fout:          emptyNull(formData.get('kleur_fout')) ?? '#dc2626',
    kleur_tekst:         emptyNull(formData.get('kleur_tekst')) ?? '#0f172a',
    kleur_achtergrond:   emptyNull(formData.get('kleur_achtergrond')) ?? '#f8fafc',
    font_primair:        emptyNull(formData.get('font_primair')) ?? 'Montserrat',
    font_secundair:      emptyNull(formData.get('font_secundair')),
    huisstijl_notities:  emptyNull(formData.get('huisstijl_notities')),
  }

  const supabase = await createClient()
  const { error } = await supabase.from('bedrijfsgegevens').update(payload).eq('id', id)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/instellingen/bedrijfsgegevens/huisstijl')
  return { ok: true }
}

function emptyNull(v: FormDataEntryValue | null): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

function isMissingTable(error: { code?: string; message?: string }): boolean {
  if (!error) return false
  if (error.code === '42P01' || error.code === 'PGRST205') return true
  const m = error.message ?? ''
  return /relation .* does not exist/i.test(m) || /could not find the table/i.test(m) || /not found in the schema cache/i.test(m)
}

function isMissingColumn(error: { code?: string; message?: string }): boolean {
  if (!error) return false
  if (error.code === '42703') return true
  const m = error.message ?? ''
  return /column .* does not exist/i.test(m) || /Could not find.*column/i.test(m)
}
