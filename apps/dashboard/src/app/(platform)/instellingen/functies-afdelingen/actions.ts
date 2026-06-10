'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@everts/database/server'
import { z } from 'zod'

type ActionResult = { ok: true } | { ok: false; error: string }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

const naamSchema = z.object({ naam: z.string().min(1), volgorde: z.coerce.number().default(0) })

const pauzeItemSchema = z.object({
  pauze_start: z.string().regex(/^\d{2}:\d{2}$/),
  pauze_eind:  z.string().regex(/^\d{2}:\d{2}$/),
})

const roosterTemplateSchema = z.object({
  werkdagen:             z.array(z.number().int().min(1).max(7)).min(1, 'Minimaal 1 werkdag'),
  dagstart:              z.string().regex(/^\d{2}:\d{2}$/, 'Tijd verplicht'),
  dageind:               z.string().regex(/^\d{2}:\d{2}$/, 'Tijd verplicht'),
  contracturen_per_week: z.coerce.number().min(0).max(80),
  pauzes:                z.array(pauzeItemSchema).default([]),
})

const functieSchema = z.object({
  naam:              z.string().min(1),
  volgorde:          z.coerce.number().default(0),
  standaard_rooster: roosterTemplateSchema.nullable().optional(),
})

// ── Functies ─────────────────────────────────────────────────────────────────

export async function upsertFunctie(raw: unknown, id?: string): Promise<ActionResult> {
  const p = functieSchema.safeParse(raw)
  if (!p.success) return { ok: false, error: p.error.errors[0]?.message ?? 'Ongeldig' }
  const { error } = id
    ? await db().from('medewerker_functies').update(p.data).eq('id', id)
    : await db().from('medewerker_functies').insert({ ...p.data, actief: true })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/instellingen/functies-afdelingen')
  return { ok: true }
}

export async function verwijderFunctie(id: string): Promise<ActionResult> {
  const { error } = await db().from('medewerker_functies').update({ actief: false }).eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/instellingen/functies-afdelingen')
  return { ok: true }
}

// ── Afdelingen ────────────────────────────────────────────────────────────────

export async function upsertAfdeling(raw: unknown, id?: string): Promise<ActionResult> {
  const p = naamSchema.safeParse(raw)
  if (!p.success) return { ok: false, error: p.error.errors[0]?.message ?? 'Ongeldig' }
  const { error } = id
    ? await db().from('medewerker_afdelingen').update(p.data).eq('id', id)
    : await db().from('medewerker_afdelingen').insert({ ...p.data, actief: true })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/instellingen/functies-afdelingen')
  return { ok: true }
}

export async function verwijderAfdeling(id: string): Promise<ActionResult> {
  const { error } = await db().from('medewerker_afdelingen').update({ actief: false }).eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/instellingen/functies-afdelingen')
  return { ok: true }
}
