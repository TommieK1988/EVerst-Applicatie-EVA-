'use server'

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { PlanningUursoort } from '@everts/database/platform-types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

const uursoortSchema = z.object({
  naam:  z.string().min(1, 'Naam is verplicht').max(80),
  code:  z.string().min(1, 'Code is verplicht').max(10).transform(s => s.toUpperCase()),
  kleur: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Ongeldig kleurformaat'),
  volgorde: z.number().int().min(0),
  everts_calc_omschrijvingen: z.array(z.string()).default([]),
})

type ActionResult = { ok: true } | { ok: false; error: string }

export async function laadUursoorten(): Promise<{ ok: true; data: PlanningUursoort[] } | { ok: false; error: string }> {
  const { data, error } = await db()
    .from('planning_uursoorten')
    .select('*')
    .order('volgorde', { ascending: true })

  if (error) return { ok: false, error: error.message }
  return { ok: true, data: data as PlanningUursoort[] }
}

export async function maakUursoort(raw: unknown): Promise<ActionResult> {
  const parsed = uursoortSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message ?? 'Ongeldig' }

  const { error } = await db()
    .from('planning_uursoorten')
    .insert(parsed.data)

  if (error) {
    if (error.code === '23505') return { ok: false, error: `Code '${parsed.data.code}' bestaat al.` }
    return { ok: false, error: error.message }
  }
  revalidatePath('/instellingen/planning')
  return { ok: true }
}

export async function updateUursoort(id: string, raw: unknown): Promise<ActionResult> {
  const parsed = uursoortSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message ?? 'Ongeldig' }

  const { error } = await db()
    .from('planning_uursoorten')
    .update(parsed.data)
    .eq('id', id)

  if (error) {
    if (error.code === '23505') return { ok: false, error: `Code '${parsed.data.code}' bestaat al.` }
    return { ok: false, error: error.message }
  }
  revalidatePath('/instellingen/planning')
  return { ok: true }
}

export async function verwijderUursoort(id: string): Promise<ActionResult> {
  // Soft delete
  const { error } = await db()
    .from('planning_uursoorten')
    .update({ actief: false })
    .eq('id', id)

  if (error) return { ok: false, error: error.message }
  revalidatePath('/instellingen/planning')
  return { ok: true }
}

export async function herschikUursoorten(ids: string[]): Promise<ActionResult> {
  const updates = ids.map((id, i) =>
    db().from('planning_uursoorten').update({ volgorde: i }).eq('id', id)
  )
  const results = await Promise.all(updates)
  const failed = results.find(r => r.error)
  if (failed?.error) return { ok: false, error: failed.error.message }

  revalidatePath('/instellingen/planning')
  return { ok: true }
}

export async function updateEvertsCalcMapping(
  id: string,
  omschrijvingen: string[]
): Promise<ActionResult> {
  const cleaned = omschrijvingen.map(s => s.trim()).filter(Boolean)

  const { error } = await db()
    .from('planning_uursoorten')
    .update({ everts_calc_omschrijvingen: cleaned })
    .eq('id', id)

  if (error) return { ok: false, error: error.message }
  revalidatePath('/instellingen/planning')
  return { ok: true }
}
