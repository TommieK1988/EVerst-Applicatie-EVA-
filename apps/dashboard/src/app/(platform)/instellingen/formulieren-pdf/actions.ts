'use server'

import { createAdminClient, createClient } from '@everts/database/server'
import { loadBedrijfsgegevens } from '@/app/(platform)/instellingen/bedrijfsgegevens/actions'
import { revalidatePath } from 'next/cache'

export type PdfConfig = {
  id: string
  toon_logo: boolean
  toon_invuller: boolean
  toon_project_ref: boolean
  koptekst: string | null
  voettekst: string | null
  briefpapier_marge_boven_mm: number
  briefpapier_marge_onder_mm: number
  bijgewerkt_op: string
}

export type PdfConfigResult =
  | { ok: true; config: PdfConfig; logoUrl: string | null }
  | { ok: false; error: string }

export async function getPdfConfig(): Promise<PdfConfigResult> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('formulier_pdf_config')
    .select('*')
    .limit(1)
    .maybeSingle()

  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'PDF configuratie niet gevonden.' }

  // Logo ophalen uit bedrijfsgegevens
  const bedrijfResult = await loadBedrijfsgegevens()
  const logoUrl = bedrijfResult.ok
    ? (bedrijfResult.data?.logo_primair_url ?? bedrijfResult.data?.logo_url ?? null)
    : null

  return { ok: true, config: data as PdfConfig, logoUrl }
}

export async function savePdfConfig(input: {
  toon_logo: boolean
  toon_invuller: boolean
  toon_project_ref: boolean
  koptekst: string
  voettekst: string
  briefpapier_marge_boven_mm: number
  briefpapier_marge_onder_mm: number
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = createAdminClient()

  // Haal bestaande rij op
  const { data: existing } = await supabase
    .from('formulier_pdf_config')
    .select('id')
    .limit(1)
    .maybeSingle()

  // Marges begrenzen op een zinnige range (mm).
  const klem = (n: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(n || 0)))

  const payload = {
    toon_logo:        input.toon_logo,
    toon_invuller:    input.toon_invuller,
    toon_project_ref: input.toon_project_ref,
    koptekst:         input.koptekst.trim() || null,
    voettekst:        input.voettekst.trim() || null,
    briefpapier_marge_boven_mm: klem(input.briefpapier_marge_boven_mm, 0, 120),
    briefpapier_marge_onder_mm: klem(input.briefpapier_marge_onder_mm, 0, 120),
    bijgewerkt_op:    new Date().toISOString(),
  }

  let error: { message: string } | null = null

  if (existing?.id) {
    const result = await supabase
      .from('formulier_pdf_config')
      .update(payload)
      .eq('id', existing.id)
    error = result.error
  } else {
    const result = await supabase
      .from('formulier_pdf_config')
      .insert(payload)
    error = result.error
  }

  if (error) return { ok: false, error: error.message }
  revalidatePath('/instellingen/formulieren-pdf')
  return { ok: true }
}
