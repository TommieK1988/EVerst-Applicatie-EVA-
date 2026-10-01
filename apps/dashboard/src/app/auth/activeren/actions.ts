'use server'

import { cookies, headers } from 'next/headers'
import { z } from 'zod'
import { createClient, createAdminClient } from '@everts/database/server'
import { APPARAAT_COOKIE, MOBIEL_MARKER_COOKIE, MOBIEL_SESSIE_MAXAGE } from '@everts/database/cookies'
import { isMobielVerzoek } from '@/lib/isMobileUA'
import { logtInMetMicrosoft, emailPatroon } from '@/lib/auth/account-regels'
import {
  controleerActivatielink, verbruikActivatielink, geefActivatielinkVrij,
} from '@/lib/auth/activatielink'

const schema = z.object({
  token:    z.string().min(1).max(128),
  nieuw:    z.string().min(8, 'Minimaal 8 tekens'),
  bevestig: z.string(),
}).refine(d => d.nieuw === d.bevestig, {
  message: 'Wachtwoorden komen niet overeen',
  path: ['bevestig'],
})

const LINK_FOUT = {
  onbekend: 'Deze link klopt niet. Gebruik de knop in je mail, of vraag een nieuwe link aan via Wachtwoord vergeten.',
  gebruikt: 'Met deze link is al een wachtwoord gekozen. Log in met dat wachtwoord, of kies Wachtwoord vergeten.',
  verlopen: 'Deze link is verlopen. Kies op het inlogscherm Wachtwoord vergeten voor een nieuwe.',
} as const

/**
 * Zet het eerste (of een nieuw) wachtwoord via een activatielink en logt meteen in.
 *
 * Bewust zonder sessie-gate: wie hier komt heeft nog geen wachtwoord en dus geen sessie.
 * Het toegangsbewijs is de link zelf (geheim token uit de mail, alleen als hash opgeslagen,
 * met vervaltijd en eenmalig te verbruiken). Daarnaast dezelfde medewerker-poort als
 * /login en /auth/callback: actief, gebruiker_type ≠ geen, en geen bedrijfsadres (dat logt
 * met Microsoft in en hoort geen wachtwoord te krijgen).
 */
export async function activeerAccount(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = schema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message ?? 'Ongeldig' }
  const { token, nieuw } = parsed.data

  const link = await controleerActivatielink(token)
  if (!link.geldig) return { ok: false, error: LINK_FOUT[link.reden] }

  const admin = createAdminClient()
  const { data: gebruiker } = await admin.auth.admin.getUserById(link.authUserId)
  const email = gebruiker?.user?.email
  if (!email || logtInMetMicrosoft(email)) return { ok: false, error: 'Dit account heeft geen toegang tot EVA.' }

  const { data: medewerker } = await admin
    .from('medewerkers')
    .select('id, auth_user_id')
    .ilike('email', emailPatroon(email))
    .eq('actief', true)
    .neq('gebruiker_type', 'geen')
    .maybeSingle()
  if (!medewerker) return { ok: false, error: 'Dit account heeft geen toegang tot EVA.' }

  // Eerst de link claimen, dan pas het wachtwoord zetten: twee gelijktijdige inzendingen
  // mogen niet allebei slagen. Lukt het zetten niet, dan de link weer vrijgeven.
  if (!(await verbruikActivatielink(link.id))) return { ok: false, error: LINK_FOUT.gebruikt }
  const { error: updateFout } = await admin.auth.admin.updateUserById(link.authUserId, {
    password: nieuw,
    email_confirm: true,
  })
  if (updateFout) {
    await geefActivatielinkVrij(link.id)
    return { ok: false, error: updateFout.message }
  }

  if (!medewerker.auth_user_id) {
    await admin.from('medewerkers').update({ auth_user_id: link.authUserId }).eq('id', medewerker.id)
  }

  // Meteen inloggen, zodat de nieuwe collega niet nóg een keer zijn gegevens hoeft te typen.
  const mobiel = isMobielVerzoek(
    (await headers()).get('user-agent'),
    (await cookies()).get(APPARAAT_COOKIE)?.value,
  )
  const supabase = await createClient({ persistentSessie: mobiel })
  const { error: loginFout } = await supabase.auth.signInWithPassword({ email, password: nieuw })
  if (loginFout) {
    // Het wachtwoord staat; alleen het automatisch inloggen ging mis. Dan zelf laten inloggen.
    return { ok: false, error: 'Je wachtwoord is opgeslagen. Log nu in op het inlogscherm.' }
  }
  if (mobiel) {
    (await cookies()).set(MOBIEL_MARKER_COOKIE, '1', { path: '/', sameSite: 'lax', maxAge: MOBIEL_SESSIE_MAXAGE })
  }
  return { ok: true }
}
