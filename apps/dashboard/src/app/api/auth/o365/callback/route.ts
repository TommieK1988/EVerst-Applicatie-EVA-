import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@everts/database/server'
import { getCurrentMedewerker, isBeheerder, getEffectieveRechten } from '@/lib/auth/rechten'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code         = searchParams.get('code')
  const state        = searchParams.get('state')
  const errorParam   = searchParams.get('error')

  if (errorParam) {
    return NextResponse.redirect(`${origin}/medewerkers?fout=o365_afgebroken`)
  }
  if (!code || !state) {
    return NextResponse.redirect(`${origin}/medewerkers?fout=o365_ongeldig`)
  }

  // CSRF-check: state = `nonce:medewerker_id`; de nonce moet matchen met de httpOnly-cookie.
  const [nonce, medewerker_id] = state.split(':')
  const cookieNonce = request.cookies.get('o365_oauth_state')?.value
  if (!nonce || !medewerker_id || !cookieNonce || nonce !== cookieNonce) {
    return NextResponse.redirect(`${origin}/medewerkers?fout=o365_state`)
  }

  // Object-level authz: alleen de EIGEN medewerker mag gekoppeld worden (tenzij beheerder).
  const huidige = await getCurrentMedewerker()
  if (!huidige) {
    return NextResponse.redirect(`${origin}/medewerkers?fout=o365_ongeldig`)
  }
  const magBeheren = isBeheerder(await getEffectieveRechten(huidige))
  if (huidige.id !== medewerker_id && !magBeheren) {
    return NextResponse.redirect(`${origin}/medewerkers?fout=o365_state`)
  }

  const clientId     = process.env.O365_CLIENT_ID!
  const clientSecret = process.env.O365_CLIENT_SECRET!
  const tenant       = process.env.O365_TENANT_ID ?? 'common'
  const redirectUri  = process.env.O365_REDIRECT_URI ?? `${origin}/api/auth/o365/callback`

  // Token exchange
  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     clientId,
        client_secret: clientSecret,
        code,
        redirect_uri:  redirectUri,
        grant_type:    'authorization_code',
      }),
    }
  )

  if (!tokenRes.ok) {
    return NextResponse.redirect(`${origin}/medewerkers/${medewerker_id}?fout=o365_token`)
  }

  const tokens = await tokenRes.json() as {
    access_token: string
    refresh_token?: string
    expires_in: number
    token_type: string
  }

  // Fetch user info
  const meRes = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })

  if (!meRes.ok) {
    return NextResponse.redirect(`${origin}/medewerkers/${medewerker_id}?fout=o365_profiel`)
  }

  const me = await meRes.json() as { id: string; mail?: string; userPrincipalName?: string; tenantId?: string }
  const o365Email    = me.mail ?? me.userPrincipalName ?? null
  const o365UserId   = me.id
  // Tenant ID from JWT decode shortcut: extract from access token (aud/tid claim)
  let o365TenantId: string | null = null
  try {
    const payload = JSON.parse(Buffer.from(tokens.access_token.split('.')[1], 'base64url').toString())
    o365TenantId = payload.tid ?? null
  } catch { /* ignore */ }

  const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  // Update medewerker
  await supabase
    .from('medewerkers')
    .update({ o365_user_id: o365UserId, o365_email: o365Email, o365_tenant_id: o365TenantId })
    .eq('id', medewerker_id)

  // Upsert tokens
  await supabase
    .from('medewerker_o365_tokens')
    .upsert({
      medewerker_id,
      access_token:     tokens.access_token,
      refresh_token:    tokens.refresh_token ?? null,
      token_expires_at: tokenExpiresAt,
      scopes:           ['offline_access', 'User.Read', 'Mail.Send'],
      updated_at:       new Date().toISOString(),
    }, { onConflict: 'medewerker_id' })

  // State-cookie is verbruikt — opruimen.
  const done = NextResponse.redirect(`${origin}/medewerkers/${medewerker_id}?o365=gekoppeld`)
  done.cookies.delete('o365_oauth_state')
  return done
}
