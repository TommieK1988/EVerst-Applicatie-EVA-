'use server'
import { createClient, createAdminClient } from '@everts/database/server'
import { cookies, headers } from 'next/headers'
import { APPARAAT_COOKIE, MOBIEL_MARKER_COOKIE, MOBIEL_SESSIE_MAXAGE } from '@everts/database/cookies'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { COOKIE_SESSIE_VERLOOPT } from '@/lib/sessie'
import { isMobielVerzoek } from '@/lib/isMobileUA'

const loginSchema = z.object({
  email: z.string().email('Ongeldig e-mailadres'),
  wachtwoord: z.string().min(1, 'Wachtwoord is verplicht'),
})

/**
 * Wachtwoord-login voor medewerkers zonder @everts.chat / Microsoft-account
 * (app-gebruikers op mobiel). Loopt bewust NIET via `/auth/callback` — dus de
 * medewerker-poort (actief + gebruiker_type ≠ geen) wordt hier opnieuw afgedwongen.
 * Bij afwijzing meteen weer uitloggen, zodat er geen sessie buiten de poort om
 * blijft bestaan. Zie ook de gate in de mobiele layout (defense in depth).
 */
export async function wachtwoordLogin(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = loginSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message ?? 'Ongeldig' }

  // Wachtwoord-login is een mobiel-pad; het apparaat bepaalt de persistente
  // 3-daagse sessie.
  const mobiel = isMobielVerzoek(
    (await headers()).get('user-agent'),
    (await cookies()).get(APPARAAT_COOKIE)?.value,
  )
  const supabase = await createClient({ persistentSessie: mobiel })

  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.wachtwoord,
  })
  // Bewust generieke fout: geen onderscheid tussen "bestaat niet" en "fout wachtwoord".
  if (error || !data.user?.email) return { ok: false, error: 'Onjuiste inloggegevens.' }

  const admin = createAdminClient()
  const { data: medewerker } = await admin
    .from('medewerkers')
    .select('id, auth_user_id')
    .eq('email', data.user.email)
    .eq('actief', true)
    .neq('gebruiker_type', 'geen')
    .maybeSingle()

  if (!medewerker) {
    await supabase.auth.signOut()
    return { ok: false, error: 'Dit account heeft geen toegang tot EVA.' }
  }

  if (!medewerker.auth_user_id) {
    await admin.from('medewerkers').update({ auth_user_id: data.user.id }).eq('id', medewerker.id)
  }

  if (mobiel) {
    const store = await cookies()
    store.set(MOBIEL_MARKER_COOKIE, '1', { path: '/', sameSite: 'lax', maxAge: MOBIEL_SESSIE_MAXAGE })
  }

  return { ok: true }
}

/**
 * Stuurt een herstel-link (wachtwoord vergeten). De link loopt via de callback
 * naar de set-wachtwoord-pagina. Antwoordt altijd `ok` — geen onderscheid tussen
 * bestaande en onbekende e-mail, zodat je niet kunt aftasten wie een account heeft.
 */
export async function stuurHerstelLink(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = z.object({ email: z.string().email('Ongeldig e-mailadres') }).safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message ?? 'Ongeldig' }

  const h = await headers()
  const host = h.get('host') ?? 'localhost:3000'
  const protocol = host.startsWith('localhost') ? 'http' : 'https'
  const redirectTo = `${protocol}://${host}/auth/callback?next=${encodeURIComponent('/wachtwoord-instellen')}`

  const supabase = await createClient()
  await supabase.auth.resetPasswordForEmail(parsed.data.email, { redirectTo })
  return { ok: true }
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  // Verval- + markercookie wissen: die hebben op mobiel een Max-Age van 3 dagen
  // en zouden anders in de volgende login blijven hangen (verkeerd vervalmoment).
  const store = await cookies()
  store.set(COOKIE_SESSIE_VERLOOPT, '', { maxAge: 0, path: '/' })
  store.set(MOBIEL_MARKER_COOKIE, '', { maxAge: 0, path: '/' })
  redirect('/login')
}
