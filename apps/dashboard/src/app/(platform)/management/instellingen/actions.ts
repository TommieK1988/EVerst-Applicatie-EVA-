'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@everts/database/server'

export type ActieResultaat = { ok: boolean; fout?: string }

/* ── AK per werkmaatschappij ──────────────────────────────────────── */

export type AkInput = {
  id?: string
  jaar: number
  filiaal: string
  bedrag_ak: number
  opmerkingen?: string | null
}

export async function upsertAk(input: AkInput): Promise<ActieResultaat> {
  if (!input.filiaal?.trim()) return { ok: false, fout: 'Werkmaatschappij is verplicht.' }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const payload = {
    jaar:        input.jaar,
    filiaal:     input.filiaal.trim(),
    bedrag_ak:   input.bedrag_ak,
    opmerkingen: input.opmerkingen ?? null,
    updated_at:  new Date().toISOString(),
  }
  const { error } = input.id
    ? await supabase.from('management_ak').update(payload).eq('id', input.id)
    : await supabase.from('management_ak').insert(payload)
  if (error) return { ok: false, fout: error.message }
  revalidatePath('/management/instellingen')
  revalidatePath('/management')
  return { ok: true }
}

export async function verwijderAk(id: string): Promise<ActieResultaat> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const { error } = await supabase.from('management_ak').delete().eq('id', id)
  if (error) return { ok: false, fout: error.message }
  revalidatePath('/management/instellingen')
  revalidatePath('/management')
  return { ok: true }
}

/* ── Doelstellingen (per filiaal en/of projectleider) ─────────────── */

export type DoelstellingInput = {
  id?: string
  jaar: number
  filiaal?: string | null
  projectleider?: string | null
  omzet_doelstelling?: number | null
  resultaat_doelstelling?: number | null
}

export async function upsertDoelstelling(input: DoelstellingInput): Promise<ActieResultaat> {
  if (!input.filiaal && !input.projectleider) {
    return { ok: false, fout: 'Kies minstens een werkmaatschappij of projectleider.' }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const payload = {
    jaar:                   input.jaar,
    filiaal:                input.filiaal?.trim() || null,
    projectleider:          input.projectleider?.trim() || null,
    omzet_doelstelling:     input.omzet_doelstelling ?? null,
    resultaat_doelstelling: input.resultaat_doelstelling ?? null,
    updated_at:             new Date().toISOString(),
  }
  const { error } = input.id
    ? await supabase.from('management_doelstellingen').update(payload).eq('id', input.id)
    : await supabase.from('management_doelstellingen').insert(payload)
  if (error) return { ok: false, fout: error.message }
  revalidatePath('/management/instellingen')
  revalidatePath('/management')
  return { ok: true }
}

export async function verwijderDoelstelling(id: string): Promise<ActieResultaat> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const { error } = await supabase.from('management_doelstellingen').delete().eq('id', id)
  if (error) return { ok: false, fout: error.message }
  revalidatePath('/management/instellingen')
  revalidatePath('/management')
  return { ok: true }
}

/* ── OHW-correctie per dossier ────────────────────────────────────── */

export type OhwInput = {
  id?: string
  boekjaar: number
  bouw7_id: string
  projectnummer?: string | null
  projectnaam?: string | null
  filiaal?: string | null
  omzet_vorig_boekjaar: number
  resultaat_vorig_boekjaar: number
  opmerkingen?: string | null
}

export async function upsertOhw(input: OhwInput): Promise<ActieResultaat> {
  if (!input.bouw7_id?.trim()) return { ok: false, fout: 'Kies een dossier.' }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const payload = {
    boekjaar:                 input.boekjaar,
    bouw7_id:                 input.bouw7_id.trim(),
    projectnummer:            input.projectnummer ?? null,
    projectnaam:              input.projectnaam ?? null,
    filiaal:                  input.filiaal ?? null,
    omzet_vorig_boekjaar:     input.omzet_vorig_boekjaar,
    resultaat_vorig_boekjaar: input.resultaat_vorig_boekjaar,
    opmerkingen:              input.opmerkingen ?? null,
    updated_at:               new Date().toISOString(),
  }
  const { error } = input.id
    ? await supabase.from('management_ohw').update(payload).eq('id', input.id)
    : await supabase.from('management_ohw').upsert(payload, { onConflict: 'boekjaar,bouw7_id' })
  if (error) return { ok: false, fout: error.message }
  revalidatePath('/management/instellingen')
  revalidatePath('/management')
  return { ok: true }
}

export async function verwijderOhw(id: string): Promise<ActieResultaat> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const { error } = await supabase.from('management_ohw').delete().eq('id', id)
  if (error) return { ok: false, fout: error.message }
  revalidatePath('/management/instellingen')
  revalidatePath('/management')
  return { ok: true }
}
