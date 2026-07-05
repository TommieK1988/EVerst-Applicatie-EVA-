'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/everts-calc/supabase/server'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getDb(): Promise<any> {
  return createClient()
}

// ─── Sjablonen ────────────────────────────────────────────────────────────────

export async function getSjablonen() {
  const supabase = await getDb()
  const { data, error } = await supabase
    .from('quote_templates')
    .select('*')
    .order('naam')
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function maakSjabloon(data: {
  naam: string
  beschrijving?: string
  standaard_voorwaarden?: string
  standaard_uitsluitingen?: string
  standaard_opmerkingen?: string
  standaard_aanhef?: string
  standaard_inleiding?: string
  standaard_slottekst?: string
  geldigheid_dagen?: number
  is_standaard?: boolean
}): Promise<string> {
  const supabase = await getDb()
  const { data: row, error } = await supabase
    .from('quote_templates')
    .insert({ geldigheid_dagen: 30, is_standaard: false, ...data })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  revalidatePath('/instellingen/offertes')
  return row.id
}

export async function updateSjabloon(id: string, data: {
  naam?: string
  beschrijving?: string
  standaard_voorwaarden?: string
  standaard_uitsluitingen?: string
  standaard_opmerkingen?: string
  standaard_aanhef?: string
  standaard_inleiding?: string
  standaard_slottekst?: string
  geldigheid_dagen?: number
  is_standaard?: boolean
}): Promise<void> {
  const supabase = await getDb()
  const { error } = await supabase
    .from('quote_templates')
    .update(data)
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/instellingen/offertes')
}

export async function verwijderSjabloon(id: string): Promise<void> {
  const supabase = await getDb()
  const { error } = await supabase
    .from('quote_templates')
    .delete()
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/instellingen/offertes')
}

export async function setStandaardSjabloon(id: string): Promise<void> {
  const supabase = await getDb()
  // Reset alle andere
  await supabase.from('quote_templates').update({ is_standaard: false }).neq('id', id)
  await supabase.from('quote_templates').update({ is_standaard: true }).eq('id', id)
  revalidatePath('/instellingen/offertes')
}

// ─── Layouts ──────────────────────────────────────────────────────────────────

export async function getLayouts() {
  const supabase = await getDb()
  const { data, error } = await supabase
    .from('quote_layouts')
    .select('*')
    .order('naam')
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function getLayout(id: string) {
  const supabase = await getDb()
  const { data, error } = await supabase
    .from('quote_layouts')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw new Error(error.message)
  return data
}

export async function maakLayout(data: {
  naam: string
  beschrijving?: string
  html_template?: string
  primaire_kleur?: string
  secundaire_kleur?: string
  accent_kleur?: string
  lettertype?: string
  lettergrootte?: number
  papier_formaat?: string
  papier_orientatie?: string
  marge_boven?: number
  marge_onder?: number
  marge_links?: number
  marge_rechts?: number
  toon_voorblad?: boolean
  toon_specificatie?: boolean
  toon_voorwaarden?: boolean
  toon_paginanummer?: boolean
  koptekst?: string
  voettekst?: string
  is_standaard?: boolean
}): Promise<string> {
  const supabase = await getDb()
  const { data: row, error } = await supabase
    .from('quote_layouts')
    .insert({
      primaire_kleur: '#1a56db',
      secundaire_kleur: '#f8fafc',
      accent_kleur: '#009439',
      kleur_niveau_2: '#475569',
      kleur_niveau_3: '#e2e8f0',
      lettertype: 'system-ui, sans-serif',
      lettergrootte: 10,
      papier_formaat: 'A4',
      papier_orientatie: 'portrait',
      marge_boven: 15,
      marge_onder: 15,
      marge_links: 18,
      marge_rechts: 18,
      toon_voorblad: true,
      toon_specificatie: true,
      toon_voorwaarden: true,
      toon_paginanummer: true,
      voettekst: 'Pagina {{paginanummer}} van {{totaal_paginas}}',
      is_standaard: false,
      ...data,
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  revalidatePath('/instellingen/offertes')
  return row.id
}

export async function updateLayout(id: string, data: Record<string, unknown>): Promise<void> {
  const supabase = await getDb()
  const { error } = await supabase
    .from('quote_layouts')
    .update(data)
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/instellingen/offertes')
  revalidatePath(`/instellingen/offerte-layout/${id}`)
}

export async function kopieerLayout(id: string): Promise<string> {
  const supabase = await getDb()
  const { data: bron, error: fetchErr } = await supabase
    .from('quote_layouts')
    .select('*')
    .eq('id', id)
    .single()
  if (fetchErr || !bron) throw new Error('Layout niet gevonden')

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id: _id, created_at: _ca, updated_at: _ua, is_standaard: _std, ...velden } = bron
  const { data: nieuw, error: insertErr } = await supabase
    .from('quote_layouts')
    .insert({ ...velden, naam: `Kopie van ${bron.naam}`, is_standaard: false })
    .select('id')
    .single()
  if (insertErr || !nieuw) throw new Error(insertErr?.message ?? 'Kopiëren mislukt')
  revalidatePath('/instellingen/offertes')
  return nieuw.id
}

export async function verwijderLayout(id: string): Promise<void> {
  const supabase = await getDb()
  const { error } = await supabase
    .from('quote_layouts')
    .delete()
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/instellingen/offertes')
}

export async function setStandaardLayout(id: string): Promise<void> {
  const supabase = await getDb()
  await supabase.from('quote_layouts').update({ is_standaard: false }).neq('id', id)
  await supabase.from('quote_layouts').update({ is_standaard: true }).eq('id', id)
  revalidatePath('/instellingen/offertes')
}
