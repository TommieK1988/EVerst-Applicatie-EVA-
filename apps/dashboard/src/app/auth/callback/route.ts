import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient, createAdminClient } from '@everts/database/server'
import { APPARAAT_COOKIE, MOBIEL_MARKER_COOKIE, MOBIEL_SESSIE_MAXAGE } from '@everts/database/cookies'
import { isMobielVerzoek } from '@/lib/isMobileUA'
import { veiligNextPad } from '@/lib/auth/next-pad'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const mobiel = isMobielVerzoek(
    request.headers.get('user-agent'),
    (await cookies()).get(APPARAAT_COOKIE)?.value,
  )
  // Mobiel apparaat → direct naar de mobiele omgeving (geen desktop-flits na inloggen),
  // tenzij er een bestemming is meegegeven (aangetikte melding, link uit een mail).
  // Valideren is hier niet optioneel: `next` staat in de URL en zonder controle is
  // dit een open redirect. Zie lib/auth/next-pad.ts.
  const next = veiligNextPad(searchParams.get('next')) ?? (mobiel ? '/m' : '/')

  if (code) {
    // Mobiele login → auth-cookies meteen persistent schrijven (de markercookie
    // staat nog niet in de inkomende request, dus expliciet forceren).
    const supabase = await createClient({ persistentSessie: mobiel })
    const { data: { user }, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && user?.email) {
      const admin = createAdminClient()
      const { data: medewerker } = await admin
        .from('medewerkers')
        .select('id, actief, gebruiker_type, auth_user_id')
        .eq('email', user.email)
        .eq('actief', true)
        .neq('gebruiker_type', 'geen')
        .maybeSingle()

      if (medewerker) {
        if (!medewerker.auth_user_id) {
          await admin
            .from('medewerkers')
            .update({ auth_user_id: user.id })
            .eq('id', medewerker.id)
        }
        if (mobiel) {
          // Markercookie zodat de browser-client de auth-cookies vanaf nu
          // persistent blijft schrijven bij token-refreshes.
          const store = await cookies()
          store.set(MOBIEL_MARKER_COOKIE, '1', {
            path: '/', sameSite: 'lax', maxAge: MOBIEL_SESSIE_MAXAGE,
          })
        }
        return NextResponse.redirect(`${origin}${next}`)
      }
    }

    await supabase.auth.signOut()
  }

  return NextResponse.redirect(`${origin}/login?fout=geen-toegang`)
}
