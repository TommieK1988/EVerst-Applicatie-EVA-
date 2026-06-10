'use server'

import { createClient, createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { NotificatieVoorkeuren, GebruikerVoorkeuren } from '@everts/database/platform-types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adminDb = () => createAdminClient() as any

type ActionResult = { ok: true } | { ok: false; error: string }

async function getMedewerkerIdForCurrentUser(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('medewerkers')
    .select('id')
    .eq('auth_user_id', user.id)
    .eq('actief', true)
    .maybeSingle()

  return data?.id ?? null
}

// ── Profiel ────────────────────────────────────────────────────────────

const profielSchema = z.object({
  voornaam:      z.string().min(1, 'Voornaam is verplicht').max(100),
  tussenvoegsel: z.string().max(20).nullable(),
  achternaam:    z.string().min(1, 'Achternaam is verplicht').max(100),
  telefoon:      z.string().max(30).nullable(),
})

export async function updateProfiel(raw: unknown): Promise<ActionResult> {
  const parsed = profielSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message ?? 'Ongeldig' }

  const medewerker_id = await getMedewerkerIdForCurrentUser()
  if (!medewerker_id) return { ok: false, error: 'Geen medewerker-record gevonden.' }

  const { error } = await adminDb()
    .from('medewerkers')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', medewerker_id)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/account')
  revalidatePath('/', 'layout')
  return { ok: true }
}

export async function updateFoto(foto_url: string | null): Promise<ActionResult> {
  const medewerker_id = await getMedewerkerIdForCurrentUser()
  if (!medewerker_id) return { ok: false, error: 'Geen medewerker-record gevonden.' }

  const { error } = await adminDb()
    .from('medewerkers')
    .update({ foto_url, updated_at: new Date().toISOString() })
    .eq('id', medewerker_id)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/account')
  revalidatePath('/', 'layout')
  return { ok: true }
}

// ── Beveiliging ────────────────────────────────────────────────────────

const wachtwoordSchema = z.object({
  nieuw:     z.string().min(8, 'Minimaal 8 tekens'),
  bevestig:  z.string(),
}).refine(d => d.nieuw === d.bevestig, {
  message: 'Wachtwoorden komen niet overeen',
  path: ['bevestig'],
})

export async function updateWachtwoord(raw: unknown): Promise<ActionResult> {
  const parsed = wachtwoordSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message ?? 'Ongeldig' }

  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.auth as any).updateUser({ password: parsed.data.nieuw })
  if (error) return { ok: false, error: error.message }

  return { ok: true }
}

const emailSchema = z.object({
  email: z.string().email('Ongeldig e-mailadres'),
})

export async function updateEmail(raw: unknown): Promise<ActionResult> {
  const parsed = emailSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message ?? 'Ongeldig' }

  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.auth as any).updateUser({ email: parsed.data.email })
  if (error) return { ok: false, error: error.message }

  return { ok: true }
}

export async function logoutAndereSessies(): Promise<ActionResult> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.auth as any).signOut({ scope: 'others' })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ── Notificaties ───────────────────────────────────────────────────────

export async function updateNotificatieVoorkeuren(
  voorkeuren: NotificatieVoorkeuren
): Promise<ActionResult> {
  const medewerker_id = await getMedewerkerIdForCurrentUser()
  if (!medewerker_id) return { ok: false, error: 'Geen medewerker-record gevonden.' }

  const { error } = await adminDb()
    .from('medewerkers')
    .update({ notificatie_voorkeuren: voorkeuren, updated_at: new Date().toISOString() })
    .eq('id', medewerker_id)

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ── Voorkeuren ─────────────────────────────────────────────────────────

export async function updateVoorkeuren(
  voorkeuren: GebruikerVoorkeuren
): Promise<ActionResult> {
  const medewerker_id = await getMedewerkerIdForCurrentUser()
  if (!medewerker_id) return { ok: false, error: 'Geen medewerker-record gevonden.' }

  const { error } = await adminDb()
    .from('medewerkers')
    .update({ voorkeuren, updated_at: new Date().toISOString() })
    .eq('id', medewerker_id)

  if (error) return { ok: false, error: error.message }
  revalidatePath('/account')
  return { ok: true }
}
