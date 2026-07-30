'use server'

import { createClient } from '@everts/database/server'
import { z } from 'zod'

const schema = z.object({
  nieuw:    z.string().min(8, 'Minimaal 8 tekens'),
  bevestig: z.string(),
}).refine(d => d.nieuw === d.bevestig, {
  message: 'Wachtwoorden komen niet overeen',
  path: ['bevestig'],
})

/**
 * Zet het wachtwoord voor de ingelogde gebruiker. Bereikbaar na het volgen van
 * een uitnodigings- of herstel-link (die via `/auth/callback` een sessie zet en
 * dus door de medewerker-poort is gekomen). Zonder geldige sessie faalt het.
 */
export async function stelWachtwoordIn(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = schema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message ?? 'Ongeldig' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Je link is verlopen. Vraag een nieuwe uitnodiging aan.' }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.nieuw })
  if (error) return { ok: false, error: error.message }

  return { ok: true }
}
