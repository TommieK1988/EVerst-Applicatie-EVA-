'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@everts/database/server'
import { z } from 'zod'

type ActionResult = { ok: true } | { ok: false; error: string }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

const naamSchema = z.object({ naam: z.string().min(1), volgorde: z.coerce.number().default(0) })

/**
 * Accepteert zowel "07:30" als "07:30:00" en geeft altijd "HH:MM" terug.
 *
 * Een tijd uit de database (een `time`-kolom, of een standaardrooster dat ooit
 * met seconden is weggeschreven) komt terug als "07:30:00". Een `<input
 * type="time">` toont dat keurig als 07:30 maar houdt de seconden in zijn
 * waarde, en een kale `/^\d{2}:\d{2}$/` wees dat af — dan strandt elke
 * bewerking van een bestaand rooster op "Tijd verplicht".
 */
const tijdVeld = (bericht: string) =>
  z.string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/, bericht)
    .transform((t) => t.slice(0, 5))

const pauzeItemSchema = z.object({
  pauze_start: tijdVeld('Pauzetijd verplicht (HH:MM)'),
  pauze_eind:  tijdVeld('Pauzetijd verplicht (HH:MM)'),
})

const roosterTemplateSchema = z.object({
  werkdagen:             z.array(z.number().int().min(1).max(7)).min(1, 'Minimaal 1 werkdag'),
  dagstart:              tijdVeld('Tijd verplicht (HH:MM)'),
  dageind:               tijdVeld('Tijd verplicht (HH:MM)'),
  contracturen_per_week: z.coerce.number().min(0).max(80),
  pauzes:                z.array(pauzeItemSchema).default([]),
})

const functieSchema = z.object({
  naam:                  z.string().min(1),
  volgorde:              z.coerce.number().default(0),
  standaard_rooster:     roosterTemplateSchema.nullable().optional(),
  standaard_afdeling_id: z.string().uuid().or(z.literal('')).transform(v => v || null),
})

// ── Functies ─────────────────────────────────────────────────────────────────

export async function upsertFunctie(raw: unknown, id?: string): Promise<ActionResult> {
  const p = functieSchema.safeParse(raw)
  if (!p.success) return { ok: false, error: p.error.errors[0]?.message ?? 'Ongeldig' }
  const { error } = id
    ? await db().from('medewerker_functies').update(p.data).eq('id', id)
    : await db().from('medewerker_functies').insert({ ...p.data, actief: true })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/instellingen/medewerkers')
  return { ok: true }
}

export async function verwijderFunctie(id: string): Promise<ActionResult> {
  const { error } = await db().from('medewerker_functies').update({ actief: false }).eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/instellingen/medewerkers')
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
  revalidatePath('/instellingen/medewerkers')
  return { ok: true }
}

export async function verwijderAfdeling(id: string): Promise<ActionResult> {
  const { error } = await db().from('medewerker_afdelingen').update({ actief: false }).eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/instellingen/medewerkers')
  return { ok: true }
}

// ── Ploegen (beheerde lijst + teamleider) ──────────────────────────────────────

const ploegSchema = z.object({
  naam:          z.string().min(1),
  volgorde:      z.coerce.number().default(0),
  teamleider_id: z.string().uuid().nullable().or(z.literal('')).transform(v => v || null),
})

export async function upsertPloeg(raw: unknown, id?: string): Promise<ActionResult> {
  const p = ploegSchema.safeParse(raw)
  if (!p.success) return { ok: false, error: p.error.errors[0]?.message ?? 'Ongeldig' }
  const { error } = id
    ? await db().from('ploegen').update(p.data).eq('id', id)
    : await db().from('ploegen').insert({ ...p.data, actief: true })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/instellingen/medewerkers')
  return { ok: true }
}

export async function verwijderPloeg(id: string): Promise<ActionResult> {
  const { error } = await db().from('ploegen').update({ actief: false }).eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/instellingen/medewerkers')
  return { ok: true }
}
