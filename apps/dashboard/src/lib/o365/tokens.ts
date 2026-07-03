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

export type O365TokenFout = 'geen_koppeling' | 'refresh_mislukt'

export class O365TokenError extends Error {
  constructor(public readonly reden: O365TokenFout, message?: string) {
    super(message ?? reden)
    this.name = 'O365TokenError'
  }
}

interface TokenRij {
  access_token: string
  refresh_token: string | null
  token_expires_at: string | null
  scopes: string[] | null
}

/** Marge waarmee we een token als "bijna verlopen" beschouwen. */
const EXPIRY_BUFFER_MS = 60_000

function tenantFor(o365TenantId?: string | null): string {
  return o365TenantId || process.env.O365_TENANT_ID || 'common'
}

/**
 * Geeft een geldig access-token voor de opgegeven medewerker. Ververst
 * automatisch via het refresh-token wanneer het huidige token (bijna) verlopen
 * is, en persisteert het geroteerde refresh-token.
 *
 * @throws O365TokenError('geen_koppeling') als de medewerker geen O365-binding heeft
 * @throws O365TokenError('refresh_mislukt') als verversen faalt (re-consent nodig)
 */
export async function getValidAccessToken(medewerkerId: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  const { data: tokenRij } = await supabase
    .from('medewerker_o365_tokens')
    .select('access_token, refresh_token, token_expires_at, scopes')
    .eq('medewerker_id', medewerkerId)
    .maybeSingle()

  const rij = tokenRij as TokenRij | null
  if (!rij?.access_token) {
    throw new O365TokenError('geen_koppeling', 'Geen Office 365-koppeling voor deze medewerker.')
  }

  const expiresAt = rij.token_expires_at ? new Date(rij.token_expires_at).getTime() : 0
  const verlopen = !expiresAt || expiresAt < Date.now() + EXPIRY_BUFFER_MS

  if (!verlopen) {
    return rij.access_token
  }

  if (!rij.refresh_token) {
    throw new O365TokenError('refresh_mislukt', 'Geen refresh-token; opnieuw koppelen vereist.')
  }

  // Tenant van de medewerker ophalen voor de juiste token-endpoint
  const { data: medewerker } = await supabase
    .from('medewerkers')
    .select('o365_tenant_id')
    .eq('id', medewerkerId)
    .maybeSingle()

  const tenant = tenantFor(medewerker?.o365_tenant_id)
  const refreshed = await refreshAccessToken(rij.refresh_token, tenant)

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

interface RefreshResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
}

async function refreshAccessToken(refreshToken: string, tenant: string): Promise<RefreshResponse> {
  const clientId = process.env.O365_CLIENT_ID
  const clientSecret = process.env.O365_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new O365TokenError('refresh_mislukt', 'O365 client-config ontbreekt.')
  }

  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  })

  if (!res.ok) {
    // invalid_grant = refresh-token verlopen/ingetrokken → re-consent nodig
    throw new O365TokenError('refresh_mislukt', `Token verversen mislukt: HTTP ${res.status}`)
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

  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
      scope: 'https://graph.microsoft.com/.default',
    }),
  })

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
