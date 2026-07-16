'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@everts/database/server'
import { GeenToegangError } from '@/lib/auth/rechten'
import { vereisMaterieelMutatie } from '@/lib/materieel/auth'
import type { KeuringSoort, TeamType } from '@/lib/materieel/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

type ActieResultaat<T = unknown> = { ok: true; data: T } | { ok: false; error: string }

async function gate(): Promise<{ ok: false; error: string } | null> {
  try { await vereisMaterieelMutatie(); return null }
  catch (e) { if (e instanceof GeenToegangError) return { ok: false, error: e.message }; throw e }
}

function herlaad() {
  revalidatePath('/materieelbeheer/instellingen')
  revalidatePath('/materieelbeheer')
}

/* ── Teams (servicebussen, keten, ploegen) ───────────────────────── */

type TeamInvoer = {
  naam: string
  type: TeamType
  omschrijving?: string | null
  kenteken?: string | null
  /** Verantwoordelijke voor het materieel van dit team — verplicht. */
  teamleider_id?: string | null
}

function valideerTeam(input: TeamInvoer): string | null {
  if (!input.naam?.trim()) return 'Naam is verplicht'
  if (!input.teamleider_id) return 'Kies een teamleider — een team zonder verantwoordelijke voegt niets toe'
  return null
}

function teamVelden(input: TeamInvoer) {
  return {
    naam: input.naam.trim(),
    type: input.type,
    omschrijving: input.omschrijving?.trim() || null,
    kenteken: input.kenteken?.trim() || null,
    teamleider_id: input.teamleider_id ?? null,
  }
}

export async function maakTeam(input: TeamInvoer): Promise<ActieResultaat<{ id: string }>> {
  const nope = await gate(); if (nope) return nope
  const fout = valideerTeam(input); if (fout) return { ok: false, error: fout }
  const { data, error } = await db().from('materieel_teams')
    .insert(teamVelden(input)).select('id').single()
  if (error) return { ok: false, error: error.message }
  herlaad()
  return { ok: true, data: { id: data.id as string } }
}

export async function updateTeam(id: string, input: TeamInvoer): Promise<ActieResultaat> {
  const nope = await gate(); if (nope) return nope
  const fout = valideerTeam(input); if (fout) return { ok: false, error: fout }
  const { error } = await db().from('materieel_teams').update(teamVelden(input)).eq('id', id)
  if (error) return { ok: false, error: error.message }
  herlaad()
  return { ok: true, data: null }
}

export async function archiveerTeam(id: string): Promise<ActieResultaat> {
  const nope = await gate(); if (nope) return nope
  const { error } = await db().from('materieel_teams').update({ actief: false }).eq('id', id)
  if (error) return { ok: false, error: error.message }
  herlaad()
  return { ok: true, data: null }
}

/* ── Instellingen (singleton) ─────────────────────────────────────── */

export async function updateInstellingen(input: {
  controle_frequentie: string
  controle_moment: string
  keuring_waarschuwing_dagen: number
  apk_waarschuwing_dagen: number
  garantie_waarschuwing_dagen: number
  keuring_soorten: KeuringSoort[]
}): Promise<ActieResultaat> {
  const nope = await gate(); if (nope) return nope

  const dagen = [input.keuring_waarschuwing_dagen, input.apk_waarschuwing_dagen, input.garantie_waarschuwing_dagen]
  if (dagen.some((d) => !Number.isFinite(d) || d < 0)) return { ok: false, error: 'Waarschuwingstermijnen moeten 0 of hoger zijn' }

  const soorten = (input.keuring_soorten ?? [])
    .map((s) => ({ key: (s.key || s.label).toLowerCase().replace(/\s+/g, '_'), label: s.label.trim() }))
    .filter((s) => s.label)

  const { error } = await db().from('materieel_instellingen').update({
    controle_frequentie: input.controle_frequentie,
    controle_moment: input.controle_moment,
    keuring_waarschuwing_dagen: input.keuring_waarschuwing_dagen,
    apk_waarschuwing_dagen: input.apk_waarschuwing_dagen,
    garantie_waarschuwing_dagen: input.garantie_waarschuwing_dagen,
    keuring_soorten: soorten,
  }).eq('id', 1)

  if (error) return { ok: false, error: error.message }
  herlaad()
  return { ok: true, data: null }
}
