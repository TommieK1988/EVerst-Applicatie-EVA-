import 'server-only'
import { createAdminClient } from '@everts/database/server'
import { normaliseerEmail } from './account-regels'

/**
 * Heeft de medewerker zijn uitnodiging geaccepteerd, en wanneer logde hij voor het laatst in?
 * Voor het blok Toegang & gebruiker op de medewerkerkaart.
 *
 * Wordt één keer gelezen bij het openen van de kaart (server-side), niet gepeild.
 */
export type UitnodigingStatus = {
  geaccepteerd: boolean
  /** Laatste login volgens Supabase Auth, ISO-tijdstip; `null` = nog nooit. */
  laatstIngelogd: string | null
}

/**
 * De regel, los van de database zodat hij te testen is.
 *
 * "Ooit ingelogd" alleen is niet genoeg. De kapotte uitnodigingslinks van 1 oktober 2026
 * registreerden bij het aanklikken al een login, terwijl de medewerker direct "geen toegang"
 * kreeg en nooit een wachtwoord koos. Daarom: geaccepteerd als er een activatielink is
 * gebruikt, of als de laatste login ná de nieuwste nog openstaande uitnodiging ligt.
 */
export function bepaalGeaccepteerd(input: {
  gekoppeld: boolean
  laatstIngelogd: string | null
  linkGebruikt: boolean
  /** Aanmaakmoment van de nieuwste ongebruikte activatielink, als die er is. */
  openstaandeLinkSinds: string | null
}): boolean {
  if (!input.gekoppeld) return false
  if (input.linkGebruikt) return true
  if (!input.laatstIngelogd) return false
  if (!input.openstaandeLinkSinds) return true
  return new Date(input.laatstIngelogd).getTime() > new Date(input.openstaandeLinkSinds).getTime()
}

export async function haalUitnodigingStatus(
  auth_user_id: string | null,
  email: string | null,
): Promise<UitnodigingStatus> {
  if (!auth_user_id) return { geaccepteerd: false, laatstIngelogd: null }

  const admin = createAdminClient()
  const [{ data: gebruiker }, { data: links }] = await Promise.all([
    admin.auth.admin.getUserById(auth_user_id),
    // Begrensd: links van één account, een handvol per uitnodiging of herstelaanvraag.
    admin
      .from('wachtwoord_links')
      .select('aangemaakt_op, gebruikt_op')
      .eq('auth_user_id', auth_user_id)
      .order('aangemaakt_op', { ascending: false })
      .limit(50),
  ])

  // Hangt de koppeling nog aan een account op een oud adres, dan telt die niet: met het
  // huidige adres is er nog niet ingelogd. Zie koppelingVoorAdres in account-controle.ts.
  const accountEmail = normaliseerEmail(gebruiker?.user?.email)
  const gekoppeld = !!accountEmail && accountEmail === normaliseerEmail(email)
  const laatstIngelogd = gekoppeld ? (gebruiker?.user?.last_sign_in_at ?? null) : null

  const rijen = links ?? []
  return {
    laatstIngelogd,
    geaccepteerd: bepaalGeaccepteerd({
      gekoppeld,
      laatstIngelogd,
      linkGebruikt: rijen.some(r => r.gebruikt_op),
      openstaandeLinkSinds: rijen.find(r => !r.gebruikt_op)?.aangemaakt_op ?? null,
    }),
  }
}
