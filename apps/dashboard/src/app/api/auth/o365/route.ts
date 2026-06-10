import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const clientId = process.env.O365_CLIENT_ID
  if (!clientId) {
    return NextResponse.json({ error: 'Office 365 koppeling is niet geconfigureerd.' }, { status: 501 })
  }

  const medewerker_id = request.nextUrl.searchParams.get('medewerker_id')
  if (!medewerker_id) {
    return NextResponse.json({ error: 'medewerker_id ontbreekt.' }, { status: 400 })
  }

  const tenant = process.env.O365_TENANT_ID ?? 'common'
  const redirectUri = process.env.O365_REDIRECT_URI ?? `${request.nextUrl.origin}/api/auth/o365/callback`

  const scopes = [
    'offline_access',
    'User.Read',
    'Tasks.ReadWrite',
    'Calendars.ReadWrite',
    'Mail.Read',
  ].join(' ')

  const params = new URLSearchParams({
    client_id:     clientId,
    response_type: 'code',
    redirect_uri:  redirectUri,
    scope:         scopes,
    state:         medewerker_id,
    prompt:        'select_account',
  })

  const authUrl = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${params}`
  return NextResponse.redirect(authUrl)
}
