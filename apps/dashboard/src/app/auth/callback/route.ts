import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient, createAdminClient } from '@everts/database/server'
import { APPARAAT_COOKIE, MOBIEL_MARKER_COOKIE, MOBIEL_SESSIE_MAXAGE } from '@everts/database/cookies'
import { isMobielVerzoek } from '@/lib/isMobileUA'
import { veiligNextPad } from '@/lib/auth/next-pad'
import { emailPatroon } from '@/lib/auth/account-regels'
import { controleerKoppeling, type KoppelingStatus } from '@/lib/o365/tokens'

/**
 * Langer dan dit mag de koppelingscheck het inloggen niet ophouden. Meestal is het
 * access-token nog geldig en kost de check alleen een database-read; hangt Microsoft,
 * dan gaat het inloggen gewoon door.
 */
const KOPPELING_CHECK_MS = 4_000

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
        .ilike('email', emailPatroon(user.email))
        .eq('actief', true)
        .neq('gebruiker_type', 'geen')
        .maybeSingle()

      if (medewerker) {
        // Gekoppeld aan een ánder account (adres gewijzigd sinds de vorige login)? Dan wint het
        // account dat bij het huidige adres hoort: de medewerker-poort hierboven matchte op precies
        // dat adres, en dit account heeft bewezen het te bezitten. Zie lib/auth/account-controle.ts.
        if (medewerker.auth_user_id !== user.id) {
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

        // Heeft Microsoft de mailkoppeling ingetrokken (wachtwoord gewijzigd, sessies
        // ingetrokken)? Dan nu herstellen, nu de medewerker toch net bij Microsoft is
        // ingelogd — en niet pas als er een offerte verstuurd moet worden. Wie nooit
        // gekoppeld heeft ('geen') laten we met rust.
        const koppeling = await Promise.race<KoppelingStatus>([
          controleerKoppeling(medewerker.id),
          new Promise(resolve => setTimeout(() => resolve('onbekend'), KOPPELING_CHECK_MS)),
        ])
        if (koppeling === 'verlopen') {
          const herstel = new URLSearchParams({ medewerker_id: medewerker.id, terug: next, stil: '1' })
          return NextResponse.redirect(`${origin}/api/auth/o365?${herstel}`)
        }

        return NextResponse.redirect(`${origin}${next}`)
      }
    }

    await supabase.auth.signOut()
  }

  return NextResponse.redirect(`${origin}/login?fout=geen-toegang`)
}
