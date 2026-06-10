/**
 * Schilderwerk bibliotheek service
 * Hiërarchie: Onderdeel → Type → Behandeling → Schilderrecept (combinatie) → Normen
 */
import { createClient } from '@/lib/supabase/server'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getDb(): Promise<any> { return createClient() }

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SchilderOnderdeel {
  id: string
  naam: string
  code: string | null
  volgorde: number
  actief: boolean
}

export interface SchilderType {
  id: string
  onderdeel_id: string
  naam: string
  code: string | null
  eenheid: string        // 'm²' | 'm¹' | 'm³' | 'st'
  formule: string | null // null = automatisch; voor m¹ bijv. '2*B+2*H'
  volgorde: number
  actief: boolean
}

export interface SchilderBehandeling {
  id: string
  naam: string
  code: string | null
  bron: string | null
  korte_omschrijving: string | null
  uitgebreide_werkomschrijving: string | null
  volgorde: number
  actief: boolean
}

export interface SchilderArbeidNorm {
  id: string
  combinatie_id: string
  omschrijving: string | null
  minutes_per_unit: number  // minuten per eenheid
  hour_rate: number         // €/uur
  cost_per_unit: number     // (minutes/60) * hour_rate
  unit: string
  volgorde: number
}

export interface SchilderMateriaalNorm {
  id: string
  combinatie_id: string
  naam: string | null
  norm_type: string       // 'materiaal' | 'onderaanneming'
  quantity_per_unit: number
  eenheid: string | null
  unit_price: number
  cost_per_unit: number
  volgorde: number
}

export interface SchilderCombinatie {
  id: string
  onderdeel_id: string
  type_id: string
  behandeling_id: string
  behandeling: SchilderBehandeling
  arbeid_normen: SchilderArbeidNorm[]
  materiaal_normen: SchilderMateriaalNorm[]
}

// ─── Data ophalen ─────────────────────────────────────────────────────────────

export async function getSchilderOnderdelen(): Promise<SchilderOnderdeel[]> {
  const supabase = await getDb()
  const { data, error } = await supabase
    .from('schilder_onderdelen')
    .select('*')
    .eq('actief', true)
    .order('code', { nullsFirst: false })
    .order('naam')
  if (error) throw new Error(`Fout bij ophalen onderdelen: ${error.message}`)
  return data
}

export async function getSchilderTypes(onderdeel_id?: string): Promise<SchilderType[]> {
  const supabase = await getDb()
  let q = supabase.from('schilder_types').select('*').eq('actief', true)
    .order('code', { nullsFirst: false }).order('naam')
  if (onderdeel_id) q = q.eq('onderdeel_id', onderdeel_id)
  const { data, error } = await q
  if (error) throw new Error(`Fout bij ophalen types: ${error.message}`)
  return data
}

export async function getSchilderBehandelingen(): Promise<SchilderBehandeling[]> {
  const supabase = await getDb()
  const { data, error } = await supabase
    .from('schilder_behandelingen')
    .select('*')
    .eq('actief', true)
    .order('code', { nullsFirst: false })
    .order('naam')
  if (error) throw new Error(`Fout bij ophalen behandelingen: ${error.message}`)
  return data
}

export async function getSchilderCombinaties(type_id: string): Promise<SchilderCombinatie[]> {
  const supabase = await getDb()
  const { data, error } = await supabase
    .from('schilder_combinaties')
    .select(`
      *,
      behandeling:schilder_behandelingen ( id, naam, code, bron, volgorde, actief ),
      arbeid_normen:schilder_arbeid_normen ( id, combinatie_id, omschrijving, minutes_per_unit, hour_rate, cost_per_unit, unit, volgorde ),
      materiaal_normen:schilder_materiaal_normen ( id, combinatie_id, naam, norm_type, quantity_per_unit, eenheid, unit_price, cost_per_unit, volgorde )
    `)
    .eq('type_id', type_id)
    .eq('actief', true)
    .order('created_at')
  if (error) throw new Error(`Fout bij ophalen combinaties: ${error.message}`)
  return data as unknown as SchilderCombinatie[]
}

/** Ophalen voor meetstaat dropdowns — alle onderdelen + types + behandelingen + combinaties */
export async function getSchilderDropdownData() {
  const supabase = await getDb()
  const [o, t, b, c] = await Promise.all([
    supabase.from('schilder_onderdelen').select('id, naam, code').eq('actief', true).order('code', { nullsFirst: false }).order('naam'),
    supabase.from('schilder_types').select('id, onderdeel_id, naam, eenheid, formule, code').eq('actief', true).order('code', { nullsFirst: false }).order('naam'),
    supabase.from('schilder_behandelingen').select('id, naam, code').eq('actief', true).order('code', { nullsFirst: false }).order('naam'),
    supabase.from('schilder_combinaties').select('id, onderdeel_id, type_id, behandeling_id').eq('actief', true),
  ])
  if (o.error) throw new Error(o.error.message)
  if (t.error) throw new Error(t.error.message)
  if (b.error) throw new Error(b.error.message)
  if (c.error) throw new Error(c.error.message)
  return {
    onderdelen: o.data as { id: string; naam: string; code: string | null }[],
    types: t.data as { id: string; onderdeel_id: string; naam: string; eenheid: string; formule: string | null; code: string | null }[],
    behandelingen: b.data as { id: string; naam: string; code: string | null }[],
    combinaties: c.data as { id: string; onderdeel_id: string; type_id: string; behandeling_id: string }[],
  }
}
