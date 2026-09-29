/**
 * o365/tokens.ts
 *
 * Per-gebruiker Microsoft 365 token-beheer.
 *
 * De O365-binding (zie /api/auth/o365) slaat per medewerker een access- en
 * refresh-token op in de tabel `medewerker_o365_tokens`. Access-tokens verlopen
 * (~1u); deze helper levert altijd een geldig access-token op en ververst het
 * transparant via het refresh-token wanneer nodig.
 *
 * BELANGRIJK: Microsoft roteert refresh-tokens. Bij elke refresh moet het
 * nieuwe refresh-token weer worden opgeslagen, anders is de binding na verloop
 * van tijd kapot.
 */

import { createAdminClient } from '@everts/database/server'

import { fetchMetDeadline } from '@/lib/net/deadline'

export type O365TokenFout = 'geen_koppeling' | 'verlopen' | 'refresh_mislukt'

export class O365TokenError extends Error {
  constructor(public readonly reden: O365TokenFout, message?: string) {
    super(message ?? reden)
    this.name = 'O365TokenError'
  }
}

/**
 * Wat de medewerker te zien krijgt als Microsoft de koppeling heeft ingetrokken.
 * Dit komt via `e.message` in elke mailactie terecht, dus het moet zeggen wat je
 * moet dóén — "Token verversen mislukt: HTTP 400" hielp niemand verder.
 */
export const O365_VERLOPEN_MELDING =
  'Je Office 365-koppeling is verlopen (bijvoorbeeld na een wachtwoordwijziging). ' +
  'Log uit en opnieuw in bij EVA, of klik op je medewerkerkaart op "Opnieuw koppelen", en probeer het daarna nog eens.'

interface TokenRij {
  access_token: string
  refresh_token: string | null
  token_expires_at: string | null
  scopes: string[] | null
  verlopen_op: string | null
}

/** Marge waarmee we een token als "bijna verlopen" beschouwen. */
const EXPIRY_BUFFER_MS = 60_000

/** Een tokenendpoint hoort binnen seconden te antwoorden. Zie lib/net/deadline.ts. */
const TOKEN_TIMEOUT_MS = 15_000

/**
 * Foutcodes waarmee Microsoft zegt: dit refresh-token is definitief onbruikbaar,
 * alleen opnieuw inloggen helpt. `invalid_grant` dekt wachtwoordwijziging,
 * ingetrokken sessies en verlopen tokens; `interaction_required` komt van
 * conditional access (bijv. MFA opnieuw vereist).
 */
const OPNIEUW_KOPPELEN_CODES = new Set(['invalid_grant', 'interaction_required'])

function tenantFor(o365TenantId?: string | null): string {
  return o365TenantId || process.env.O365_TENANT_ID || 'common'
}

/**
 * Geeft een geldig access-token voor de opgegeven medewerker. Ververst
 * automatisch via het refresh-token wanneer het huidige token (bijna) verlopen
 * is, en persisteert het geroteerde refresh-token.
 *
 * @throws O365TokenError('geen_koppeling') als de medewerker geen O365-binding heeft
 * @throws O365TokenError('verlopen') als Microsoft de koppeling heeft ingetrokken
 *         (vastgelegd in `verlopen_op`; de volgende login herstelt hem)
 * @throws O365TokenError('refresh_mislukt') bij een tijdelijke fout (Microsoft onbereikbaar, config)
 */
export async function getValidAccessToken(medewerkerId: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  const { data: tokenRij } = await supabase
    .from('medewerker_o365_tokens')
    .select('access_token, refresh_token, token_expires_at, scopes, verlopen_op')
    .eq('medewerker_id', medewerkerId)
    .maybeSingle()

  const rij = tokenRij as TokenRij | null
  if (!rij?.access_token) {
    throw new O365TokenError('geen_koppeling', 'Geen Office 365-koppeling voor deze medewerker.')
  }

  // Al eerder geweigerd: niet opnieuw bij Microsoft aankloppen, meteen de uitleg geven.
  if (rij.verlopen_op) {
    throw new O365TokenError('verlopen', O365_VERLOPEN_MELDING)
  }

  const expiresAt = rij.token_expires_at ? new Date(rij.token_expires_at).getTime() : 0
  const verlopen = !expiresAt || expiresAt < Date.now() + EXPIRY_BUFFER_MS

  if (!verlopen) {
    return rij.access_token
  }

  if (!rij.refresh_token) {
    await markeerVerlopen(medewerkerId, 'geen refresh-token')
    throw new O365TokenError('verlopen', O365_VERLOPEN_MELDING)
  }

  // Tenant van de medewerker ophalen voor de juiste token-endpoint
  const { data: medewerker } = await supabase
    .from('medewerkers')
    .select('o365_tenant_id')
    .eq('id', medewerkerId)
    .maybeSingle()

  const tenant = tenantFor(medewerker?.o365_tenant_id)
  let refreshed: RefreshResponse
  try {
    refreshed = await refreshAccessToken(rij.refresh_token, tenant)
  } catch (e) {
    if (e instanceof RefreshGeweigerd) {
      await markeerVerlopen(medewerkerId, e.message)
      throw new O365TokenError('verlopen', O365_VERLOPEN_MELDING)
    }
    throw e
  }

  // Geroteerd refresh-token + nieuwe expiry persisteren
  const nieuwExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
  await supabase
    .from('medewerker_o365_tokens')
    .update({
      access_token: refreshed.access_token,
      // MS geeft niet altijd een nieuw refresh-token terug; behoud dan het oude
      refresh_token: refreshed.refresh_token ?? rij.refresh_token,
      token_expires_at: nieuwExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('medewerker_id', medewerkerId)

  return refreshed.access_token
}

async function markeerVerlopen(medewerkerId: string, reden: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  await supabase
    .from('medewerker_o365_tokens')
    .update({ verlopen_op: new Date().toISOString(), verlopen_reden: reden.slice(0, 500) })
    .eq('medewerker_id', medewerkerId)
}

export type KoppelingStatus = 'geen' | 'bruikbaar' | 'verlopen' | 'onbekend'

/**
 * Staat de mailkoppeling van deze medewerker nog? Gebruikt bij het inloggen: is hij
 * verlopen, dan stuurt de login-callback de medewerker meteen door de koppelflow,
 * zodat hij het niet pas merkt als er een offerte de deur uit moet.
 *
 * Ververst het token als dat nodig is — dat houdt de koppeling bij elke login ook
 * actief. Gooit nooit: een haperend Microsoft mag het inloggen niet blokkeren
 * (dan 'onbekend', en merkt de mailactie het later alsnog).
 */
export async function controleerKoppeling(medewerkerId: string): Promise<KoppelingStatus> {
  try {
    await getValidAccessToken(medewerkerId)
    return 'bruikbaar'
  } catch (e) {
    if (e instanceof O365TokenError && e.reden === 'geen_koppeling') return 'geen'
    if (e instanceof O365TokenError && e.reden === 'verlopen') return 'verlopen'
    return 'onbekend'
  }
}

interface RefreshResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
}

/** Microsoft weigert het refresh-token definitief; alleen opnieuw koppelen helpt. */
class RefreshGeweigerd extends Error {}

async function refreshAccessToken(refreshToken: string, tenant: string): Promise<RefreshResponse> {
  const clientId = process.env.O365_CLIENT_ID
  const clientSecret = process.env.O365_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new O365TokenError('refresh_mislukt', 'O365 client-config ontbreekt.')
  }

  const res = await fetchMetDeadline(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  }, { dienst: 'Microsoft (token)', timeoutMs: TOKEN_TIMEOUT_MS })

  if (!res.ok) {
    const body = await res.json().catch(() => null) as { error?: string; error_description?: string } | null
    if (body?.error && OPNIEUW_KOPPELEN_CODES.has(body.error)) {
      // error_description begint met de AADSTS-code (bijv. AADSTS50173 = wachtwoord gewijzigd).
      throw new RefreshGeweigerd(`${body.error}: ${body.error_description ?? ''}`)
    }
    throw new O365TokenError(
      'refresh_mislukt',
      `Microsoft gaf een fout bij het verversen van je Office 365-koppeling (HTTP ${res.status}${body?.error ? `, ${body.error}` : ''}). Probeer het over een paar minuten opnieuw.`,
    )
  }

  return (await res.json()) as RefreshResponse
}

// ─── App-only token (client credentials) ───────────────────────────────────────

interface AppTokenCache {
  token: string
  expiresAt: number
}
let appTokenCache: AppTokenCache | null = null

/**
 * Geeft een app-only access-token (client credentials flow). Gebruikt voor
 * gedeelde resources die los van een ingelogde gebruiker benaderd moeten worden
 * (PDF-conversie, SharePoint-dossierbestanden). In-memory gecached tot vlak voor
 * expiry.
 */
export async function getAppAccessToken(): Promise<string> {
  if (appTokenCache && appTokenCache.expiresAt > Date.now() + EXPIRY_BUFFER_MS) {
    return appTokenCache.token
  }

  const clientId = process.env.O365_CLIENT_ID
  const clientSecret = process.env.O365_CLIENT_SECRET
  const tenant = process.env.O365_TENANT_ID
  if (!clientId || !clientSecret || !tenant) {
    throw new O365TokenError('refresh_mislukt', 'O365 app-only config ontbreekt (client/secret/tenant).')
  }

  const res = await fetchMetDeadline(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
      scope: 'https://graph.microsoft.com/.default',
    }),
  }, { dienst: 'Microsoft (app-token)', timeoutMs: TOKEN_TIMEOUT_MS })

  if (!res.ok) {
    let detail = ''
    try {
      const j = (await res.json()) as { error?: string; error_description?: string }
      detail = j.error_description?.split('\n')[0] || j.error || ''
    } catch {
      /* geen JSON-body */
    }
    throw new O365TokenError('refresh_mislukt', `App-token ophalen mislukt: HTTP ${res.status} — ${detail}`)
  }

  const data = (await res.json()) as { access_token: string; expires_in: number }
  appTokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  }
  return data.access_token
}

// ─── Mailintake-token (eigen app-registratie) ──────────────────────────────────

let intakeTokenCache: AppTokenCache | null = null

/**
 * Geeft een app-only access-token voor de mailintake.
 *
 * WAAROM DIT NAAST getAppAccessToken BESTAAT
 * Het lezen van de drie intakepostbussen vraagt Mail.ReadWrite als
 * applicatiepermissie. Die permissie geven aan de bestaande EVA-registratie zou
 * te ver gaan: een Exchange ApplicationAccessPolicy werkt per app, niet per
 * permissie. De postbussen toevoegen aan de groep die nu de portaalafzender
 * afbakent, zou EVA dus meteen ook het recht geven om namens die postbussen te
 * mailen (Mail.Send heeft die registratie al).
 *
 * Vandaar een tweede registratie "EVA Mailintake" met alleen Mail.ReadWrite en
 * een eigen policy op precies de drie intakepostbussen. Die registratie heeft
 * geen Mail.Send en kan dus niets versturen.
 *
 * Valt terug op de gewone O365-credentials als de intake-variant niet is
 * ingesteld — handig bij lokaal proberen, maar dan gelden wél de machtigingen
 * van de hoofdregistratie.
 */
export async function getIntakeAccessToken(): Promise<string> {
  if (intakeTokenCache && intakeTokenCache.expiresAt > Date.now() + EXPIRY_BUFFER_MS) {
    return intakeTokenCache.token
  }

  const clientId = process.env.O365_INTAKE_CLIENT_ID || process.env.O365_CLIENT_ID
  const clientSecret = process.env.O365_INTAKE_CLIENT_SECRET || process.env.O365_CLIENT_SECRET
  const tenant = process.env.O365_TENANT_ID
  if (!clientId || !clientSecret || !tenant) {
    throw new O365TokenError(
      'refresh_mislukt',
      'Mailintake-config ontbreekt (O365_INTAKE_CLIENT_ID/SECRET of O365_TENANT_ID).',
    )
  }

  const res = await fetchMetDeadline(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
      scope: 'https://graph.microsoft.com/.default',
    }),
  }, { dienst: 'Microsoft (mailintake-token)', timeoutMs: TOKEN_TIMEOUT_MS })

  if (!res.ok) {
    let detail = ''
    try {
      const j = (await res.json()) as { error?: string; error_description?: string }
      detail = j.error_description?.split('\n')[0] || j.error || ''
    } catch {
      /* geen JSON-body */
    }
    throw new O365TokenError('refresh_mislukt', `Mailintake-token ophalen mislukt: HTTP ${res.status} — ${detail}`)
  }

  const data = (await res.json()) as { access_token: string; expires_in: number }
  intakeTokenCache = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 }
  return data.access_token
}

export type IntakeRegistratie = 'intake' | 'hoofd' | 'geen'

/**
 * Welke app-registratie de mailintake feitelijk gebruikt.
 *
 * Nodig omdat getIntakeAccessToken hierboven stil terugvalt op de
 * hoofdregistratie. Zonder dit onderscheid ziet een geslaagde verbindingstoets
 * er precies hetzelfde uit of de aparte intake-app nu wel of niet is ingesteld
 * -- en dan denk je dat fase 0 klaar is terwijl EVA met de verkeerde
 * machtigingen leest.
 */
export function intakeRegistratie(): IntakeRegistratie {
  if (process.env.O365_INTAKE_CLIENT_ID && process.env.O365_INTAKE_CLIENT_SECRET) return 'intake'
  if (process.env.O365_CLIENT_ID && process.env.O365_CLIENT_SECRET) return 'hoofd'
  return 'geen'
}
