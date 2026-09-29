import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createAdminClient } from '@everts/database/server'
import { getCurrentMedewerker, isBeheerder, getEffectieveRechten } from '@/lib/auth/rechten'
import { veiligNextPad } from '@/lib/auth/next-pad'

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

  // Alleen de rechten die de app daadwerkelijk gebruikt én die in de app-registratie
  // (met admin consent) verleend zijn: User.Read (/me) en Mail.Send (offerte mailen).
  // Tasks.ReadWrite/Calendars.ReadWrite werden nergens gebruikt; Mail.Read (voor het
  // .eml-archief) is bewust weggelaten omdat het niet is goedgekeurd — anders blokkeert
  // Microsoft de hele koppeling in een tenant zonder gebruikers-consent.
  const scopes = [
    'offline_access',
    'User.Read',
    'Mail.Send',
  ].join(' ')

  // CSRF-bescherming: random nonce in een httpOnly-cookie én in de state-parameter.
  // De callback vergelijkt beide; puur medewerker_id was voorspelbaar (geen CSRF-verdediging).
  const nonce = randomUUID()
  const state = `${nonce}:${medewerker_id}`

  // Herstel vanuit de login (zie app/auth/callback): de medewerker is net bij Microsoft
  // ingelogd, dus met een login_hint en zonder accountkiezer loopt de koppeling meestal
  // zonder één klik door. Daarna terug naar waar de login heen wilde.
  const terug = veiligNextPad(request.nextUrl.searchParams.get('terug'))
  let loginHint: string | null = null
  if (request.nextUrl.searchParams.get('stil') === '1' && huidige.id === medewerker_id) {
    const { data } = await createAdminClient()
      .from('medewerkers').select('email, o365_email').eq('id', medewerker_id).maybeSingle()
    loginHint = data?.o365_email ?? data?.email ?? null
  }

  const params = new URLSearchParams({
    client_id:     clientId,
    response_type: 'code',
    redirect_uri:  redirectUri,
    scope:         scopes,
    state,
  })
  if (loginHint) {
    params.set('login_hint', loginHint)
  } else {
    // Alleen het account laten kiezen — NIET prompt=consent. In een tenant waar
    // gebruikers zelf niet mogen consenten zou prompt=consent de gebruiker om
    // toestemming vragen en dus blokkeren, óók als de beheerder al org-brede
    // toestemming (admin consent) heeft gegeven. Met select_account gebruikt de
    // koppeling die beheerdersgoedkeuring en wordt het token (incl. Mail.Send) uitgegeven.
    params.set('prompt', 'select_account')
  }

  const authUrl = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${params}`
  const response = NextResponse.redirect(authUrl)
  const cookieOpties = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 600, // 10 minuten — genoeg voor de OAuth-round-trip
  }
  response.cookies.set('o365_oauth_state', nonce, cookieOpties)
  if (terug) response.cookies.set('o365_terug', terug, cookieOpties)
  else response.cookies.delete('o365_terug')
  return response
}
