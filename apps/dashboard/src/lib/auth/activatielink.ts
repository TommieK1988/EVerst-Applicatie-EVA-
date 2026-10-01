import 'server-only'
import { createAdminClient } from '@everts/database/server'

export type Activatielink =
  | { ok: true; actieLink: string; authUserId: string | null; herhaling: boolean }
  | { ok: false; error: string }

/**
 * Maakt het wachtwoordaccount van een app-gebruiker aan (of vindt het terug) en levert
 * de link op waarmee hij zijn wachtwoord kiest. Na het volgen zet `/auth/callback` de
 * sessie (met medewerker-poort) en stuurt door naar de set-wachtwoord-pagina.
 *
 * `generateLink` verstuurt zelf geen mail — precies wat we willen, want de uitnodiging
 * gaat in EVA-huisstijl de deur uit. Bestaat het account al (type 'invite' weigert dat),
 * dan valt hij terug op een herstel-link: dezelfde bestemming, ander token.
 *
 * LET OP — niet `properties.action_link` gebruiken. Die gaat via Supabase, en die stuurt
 * door met de tokens in het URL-fragment (`#access_token=…`). Een fragment bereikt de
 * server nooit, dus /auth/callback zag geen code en stuurde de nieuwe collega weg met
 * "geen toegang" — nog vóór hij een wachtwoord had kunnen kiezen. Zo is het in productie
 * misgegaan. Het gehashte token gaat daarom als gewone queryparameter rechtstreeks naar
 * onze callback, die het server-side inwisselt (verifyOtp). Zelfde aanpak als de
 * portaal-inloglink in lib/portaal/mail.ts.
 */
export async function maakActivatielink(input: {
  email: string
  volledigeNaam: string
  /** Basis-URL van deze EVA-omgeving, bv. https://eva.everts.chat */
  basisUrl: string
}): Promise<Activatielink> {
  const { email, volledigeNaam, basisUrl } = input
  const admin = createAdminClient().auth.admin
  // Wordt bij een token_hash-link niet gebruikt, maar Supabase eist een toegestane waarde.
  const redirectTo = `${basisUrl}/auth/callback?next=${encodeURIComponent('/wachtwoord-instellen')}`

  let herhaling = false
  let { data, error } = await admin.generateLink({
    type: 'invite',
    email,
    options: { redirectTo, data: { full_name: volledigeNaam } },
  })
  if (error && /already|exists|registered/i.test(error.message ?? '')) {
    herhaling = true
    ;({ data, error } = await admin.generateLink({ type: 'recovery', email, options: { redirectTo } }))
  }
  if (error) return { ok: false, error: error.message }

  const tokenHash = data?.properties?.hashed_token
  if (!tokenHash) return { ok: false, error: 'Geen activatielink ontvangen van Supabase' }

  const params = new URLSearchParams({
    token_hash: tokenHash,
    type: herhaling ? 'recovery' : 'invite',
    next: '/wachtwoord-instellen',
  })
  return {
    ok: true,
    actieLink: `${basisUrl}/auth/callback?${params}`,
    authUserId: data?.user?.id ?? null,
    herhaling,
  }
}
