import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { createAdminClient } from '@everts/database/server'

/**
 * Activatie- en herstellinks voor app-gebruikers (medewerkers met een wachtwoordaccount).
 *
 * WAAROM EIGEN LINKS EN NIET DIE VAN SUPABASE
 * Op 1 oktober 2026 kwam geen van de twintig nieuwe app-gebruikers binnen. Drie oorzaken,
 * allemaal van de Supabase-link zelf:
 *
 *  1. `action_link` verifieert bij Supabase en stuurt door met de tokens in het URL-fragment
 *     (`#access_token=…`). Een fragment bereikt de server nooit; /auth/callback zag niets en
 *     meldde "geen toegang" vóórdat iemand een wachtwoord kon kiezen.
 *  2. Het token verloopt na een uur. Een monteur die zijn mail 's avonds leest, is te laat.
 *  3. Het token is eenmalig en wordt bij het openen verbruikt. Mail-scanners (Outlook Safe
 *     Links, previews) openen de link vóór de ontvanger — die krijgt dan "verlopen".
 *
 * Deze links wijzen naar /auth/activeren. Openen verbruikt niets; pas als er een wachtwoord
 * is gekozen wordt de link als gebruikt gemarkeerd. Alleen de SHA-256-hash staat in de
 * database, het token zelf alleen in de mail.
 */

const GELDIGHEID_MS = {
  uitnodiging: 7 * 24 * 60 * 60 * 1000,
  herstel: 24 * 60 * 60 * 1000,
} as const

export type LinkDoel = keyof typeof GELDIGHEID_MS

const hash = (token: string) => createHash('sha256').update(token).digest('hex')

/**
 * Zorgt dat er een wachtwoordaccount voor dit adres bestaat en geeft het id terug.
 * `bekendId` is de `auth_user_id` van de medewerker, als die er al is.
 */
async function zorgVoorAccount(
  email: string,
  volledigeNaam: string | null,
  bekendId: string | null,
): Promise<{ id: string; nieuw: boolean } | { error: string }> {
  const admin = createAdminClient().auth.admin
  if (bekendId) {
    const { data } = await admin.getUserById(bekendId)
    if (data?.user) return { id: data.user.id, nieuw: false }
  }

  const { data, error } = await admin.createUser({
    email,
    email_confirm: true,
    user_metadata: volledigeNaam ? { full_name: volledigeNaam } : undefined,
  })
  if (data?.user) return { id: data.user.id, nieuw: true }
  if (!error || !/already|exists|registered/i.test(error.message ?? '')) {
    return { error: error?.message ?? 'Account aanmaken mislukt' }
  }

  // Bestaat al, maar we kennen het id niet. Er is geen "zoek op e-mail" in de admin-API;
  // generateLink levert de gebruiker wél op en verstuurt zelf niets. Het token gebruiken we niet.
  const { data: link, error: linkFout } = await admin.generateLink({ type: 'magiclink', email })
  if (link?.user) return { id: link.user.id, nieuw: false }
  return { error: linkFout?.message ?? 'Account niet gevonden' }
}

export type Activatielink =
  | { ok: true; actieLink: string; authUserId: string; herhaling: boolean }
  | { ok: false; error: string }

export async function maakActivatielink(input: {
  email: string
  volledigeNaam: string | null
  /** Basis-URL van deze EVA-omgeving, bv. https://eva.everts.chat */
  basisUrl: string
  authUserId?: string | null
  doel?: LinkDoel
}): Promise<Activatielink> {
  const email = input.email.trim().toLowerCase()
  const account = await zorgVoorAccount(email, input.volledigeNaam, input.authUserId ?? null)
  if ('error' in account) return { ok: false, error: account.error }

  const doel = input.doel ?? 'uitnodiging'
  const token = randomBytes(32).toString('base64url')
  const { error } = await createAdminClient().from('wachtwoord_links').insert({
    auth_user_id: account.id,
    email,
    token_hash: hash(token),
    doel,
    verloopt_op: new Date(Date.now() + GELDIGHEID_MS[doel]).toISOString(),
  })
  if (error) return { ok: false, error: error.message }

  return {
    ok: true,
    actieLink: `${input.basisUrl}/auth/activeren?t=${token}`,
    authUserId: account.id,
    herhaling: !account.nieuw,
  }
}

export type LinkStatus =
  | { geldig: true; id: string; authUserId: string; email: string; doel: LinkDoel }
  | { geldig: false; reden: 'onbekend' | 'gebruikt' | 'verlopen' }

/** Leest de link zonder hem te verbruiken — veilig voor scanners en previews. */
export async function controleerActivatielink(token: string | null | undefined): Promise<LinkStatus> {
  if (!token || token.length > 128) return { geldig: false, reden: 'onbekend' }
  const { data } = await createAdminClient()
    .from('wachtwoord_links')
    .select('id, auth_user_id, email, doel, verloopt_op, gebruikt_op')
    .eq('token_hash', hash(token))
    .maybeSingle()
  if (!data) return { geldig: false, reden: 'onbekend' }
  if (data.gebruikt_op) return { geldig: false, reden: 'gebruikt' }
  if (new Date(data.verloopt_op).getTime() < Date.now()) return { geldig: false, reden: 'verlopen' }
  return { geldig: true, id: data.id, authUserId: data.auth_user_id, email: data.email, doel: data.doel as LinkDoel }
}

/**
 * Markeert de link als gebruikt. Atomisch: alleen de eerste aanroep krijgt `true`, zodat
 * twee gelijktijdige inzendingen niet allebei een wachtwoord zetten.
 */
export async function verbruikActivatielink(id: string): Promise<boolean> {
  const { data } = await createAdminClient()
    .from('wachtwoord_links')
    .update({ gebruikt_op: new Date().toISOString() })
    .eq('id', id)
    .is('gebruikt_op', null)
    .select('id')
  return (data?.length ?? 0) > 0
}

/** Zet een verbruikte link terug als het wachtwoord daarna toch niet gezet kon worden. */
export async function geefActivatielinkVrij(id: string): Promise<void> {
  await createAdminClient().from('wachtwoord_links').update({ gebruikt_op: null }).eq('id', id)
}
