'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@everts/database/server'
import { vereisRecht } from '@/lib/auth/rechten'
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

// ── Urengoedkeuring per medewerker ────────────────────────────────────────────

/**
 * Wie de uren van deze medewerker goedkeurt, los van het dossier.
 *
 * Bedoeld voor kantoor: een calculator boekt op van alles, en zijn uren horen bij zijn eigen
 * leidinggevende en niet bij de projectleider van het dossier waaraan hij die middag rekende.
 * Staat hier iemand, dan VERVANGT die de hele route teamleider -> projectleider voor alle uren
 * van deze medewerker (zie lib/uren/bouw7-goedkeuring.ts). Leeg = weer via het dossier.
 */
export async function stelUrenGoedkeurderIn(
  medewerkerId: string,
  goedkeurderId: string | null,
): Promise<ActionResult> {
  // Dit bepaalt wie andermans uren mag goedkeuren; dat is geen keuzelijstje maar een
  // bevoegdheid. Achter het medewerkersrecht dus, niet achter "wie het scherm kan openen".
  await vereisRecht('medewerkers', 'schrijven')

  const p = z.object({
    medewerkerId: z.string().uuid(),
    goedkeurderId: z.string().uuid().nullable(),
  }).safeParse({ medewerkerId, goedkeurderId: goedkeurderId || null })
  if (!p.success) return { ok: false, error: 'Ongeldige keuze' }

  // Jezelf aanwijzen betekent je eigen uren goedkeuren; dat is geen controle meer.
  if (p.data.goedkeurderId === p.data.medewerkerId) {
    return { ok: false, error: 'Iemand kan niet zijn eigen uren goedkeuren.' }
  }

  const { error } = await db()
    .from('medewerkers')
    .update({ uren_goedkeurder_id: p.data.goedkeurderId })
    .eq('id', p.data.medewerkerId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/instellingen/medewerkers')
  revalidatePath('/uren')
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
