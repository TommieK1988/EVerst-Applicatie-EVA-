'use server'
import { createClient, createAdminClient } from '@everts/database/server'
import { cookies, headers } from 'next/headers'
import { APPARAAT_COOKIE, MOBIEL_MARKER_COOKIE, MOBIEL_SESSIE_MAXAGE } from '@everts/database/cookies'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { COOKIE_SESSIE_VERLOOPT } from '@/lib/sessie'
import { isMobielVerzoek } from '@/lib/isMobileUA'
import { logtInMetMicrosoft, MICROSOFT_UITLEG, emailPatroon } from '@/lib/auth/account-regels'
import { maakActivatielink } from '@/lib/auth/activatielink'
import { bouwHerstelMail } from '@/lib/auth/uitnodiging-mail'
import { verstuurMailViaGedeeldePostbus } from '@/lib/o365/mail'

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

  // Een bedrijfsadres hoort bij een Microsoft-account en heeft hier niets te zoeken. Zonder deze
  // regel krijgt zo iemand "Onjuiste inloggegevens" — feitelijk waar, maar hij gaat dan een
  // wachtwoord instellen en maakt precies het tweede account dat we willen voorkomen.
  // Dit verraadt niets: het geldt voor élk adres op dit domein, bestaand of niet.
  if (logtInMetMicrosoft(parsed.data.email)) {
    return { ok: false, error: `Log in met de knop Inloggen met Microsoft. ${MICROSOFT_UITLEG}` }
  }

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
    .ilike('email', emailPatroon(data.user.email))
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

/** Zoveel herstelmails per account per uur; daarboven antwoorden we wel `ok` maar sturen niets. */
const HERSTEL_PER_UUR = 3

/**
 * Stuurt een herstel-link (wachtwoord vergeten) naar /auth/activeren. Antwoordt altijd
 * `ok` — geen onderscheid tussen bestaande en onbekende e-mail, zodat je niet kunt
 * aftasten wie een account heeft.
 *
 * Niet meer via `resetPasswordForEmail`: die mail komt uit de Supabase-mailer (een paar
 * mails per uur voor het hele project — op 1 oktober 2026 liep dat vol), de link verloopt
 * na een uur en werkt alleen in de browser waarin hij is aangevraagd. Zie
 * lib/auth/activatielink.ts.
 */
export async function stuurHerstelLink(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = z.object({ email: z.string().email('Ongeldig e-mailadres') }).safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message ?? 'Ongeldig' }

  // Geen herstellink naar een bedrijfsadres: die link zet een wachtwoord op een account dat naast
  // het Microsoft-account komt te staan. Dit is de knop waarmee iemand dat per ongeluk doet.
  if (logtInMetMicrosoft(parsed.data.email)) {
    return { ok: false, error: `Voor dit adres stel je geen wachtwoord in. ${MICROSOFT_UITLEG}` }
  }

  const email = parsed.data.email.trim().toLowerCase()
  const admin = createAdminClient()
  const { data: medewerker } = await admin
    .from('medewerkers')
    .select('id, voornaam, auth_user_id')
    .ilike('email', emailPatroon(email))
    .eq('actief', true)
    .neq('gebruiker_type', 'geen')
    .limit(1)
    .maybeSingle()
  if (!medewerker) return { ok: true }

  if (medewerker.auth_user_id) {
    const { count } = await admin
      .from('wachtwoord_links')
      .select('id', { count: 'exact', head: true })
      .eq('auth_user_id', medewerker.auth_user_id)
      .eq('doel', 'herstel')
      .gte('aangemaakt_op', new Date(Date.now() - 60 * 60 * 1000).toISOString())
    if ((count ?? 0) >= HERSTEL_PER_UUR) return { ok: true }
  }

  const host = (await headers()).get('host') ?? 'localhost:3000'
  const protocol = host.startsWith('localhost') ? 'http' : 'https'
  const link = await maakActivatielink({
    email, volledigeNaam: null, basisUrl: `${protocol}://${host}`,
    authUserId: medewerker.auth_user_id, doel: 'herstel',
  })
  if (!link.ok) return { ok: false, error: 'Er ging iets mis. Probeer het over een paar minuten opnieuw.' }
  if (!medewerker.auth_user_id) {
    await admin.from('medewerkers').update({ auth_user_id: link.authUserId }).eq('id', medewerker.id)
  }

  const mail = bouwHerstelMail({ voornaam: medewerker.voornaam, actieLink: link.actieLink })
  try {
    await verstuurMailViaGedeeldePostbus({ to: [email], subject: mail.onderwerp, bodyHtml: mail.bodyHtml })
  } catch {
    // Gedeelde postbus niet ingesteld of onbereikbaar: dan liever de Supabase-mail dan niets.
    // Die link loopt via /auth/callback naar /wachtwoord-instellen.
    const redirectTo = `${protocol}://${host}/auth/callback?next=${encodeURIComponent('/wachtwoord-instellen')}`
    const supabase = await createClient()
    await supabase.auth.resetPasswordForEmail(email, { redirectTo })
  }
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
