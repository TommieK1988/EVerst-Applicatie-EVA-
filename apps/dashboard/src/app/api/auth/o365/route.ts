import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getCurrentMedewerker, isBeheerder, getEffectieveRechten } from '@/lib/auth/rechten'

export async function GET(request: NextRequest) {
  const clientId = process.env.O365_CLIENT_ID
  if (!clientId) {
    return NextResponse.json({ error: 'Office 365 koppeling is niet geconfigureerd.' }, { status: 501 })
  }

  const medewerker_id = request.nextUrl.searchParams.get('medewerker_id')
  if (!medewerker_id) {
    return NextResponse.json({ error: 'medewerker_id ontbreekt.' }, { status: 400 })
  }

  // Object-level authz: alleen de EIGEN medewerker mag gekoppeld worden (tenzij beheerder).
  const huidige = await getCurrentMedewerker()
  if (!huidige) {
    return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
  }
  const magBeheren = isBeheerder(await getEffectieveRechten(huidige))
  if (huidige.id !== medewerker_id && !magBeheren) {
    return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
  }

  const tenant = process.env.O365_TENANT_ID ?? 'common'
  const redirectUri = process.env.O365_REDIRECT_URI ?? `${request.nextUrl.origin}/api/auth/o365/callback`

  const scopes = [
    'offline_access',
    'User.Read',
    'Tasks.ReadWrite',
    'Calendars.ReadWrite',
    'Mail.Read',
    'Mail.Send',
  ].join(' ')

  // CSRF-bescherming: random nonce in een httpOnly-cookie én in de state-parameter.
  // De callback vergelijkt beide; puur medewerker_id was voorspelbaar (geen CSRF-verdediging).
  const nonce = randomUUID()
  const state = `${nonce}:${medewerker_id}`

  const params = new URLSearchParams({
    client_id:     clientId,
    response_type: 'code',
    redirect_uri:  redirectUri,
    scope:         scopes,
    state,
    prompt:        'select_account',
  })

  const authUrl = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${params}`
  const response = NextResponse.redirect(authUrl)
  response.cookies.set('o365_oauth_state', nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600, // 10 minuten — genoeg voor de OAuth-round-trip
  })
  return response
}
