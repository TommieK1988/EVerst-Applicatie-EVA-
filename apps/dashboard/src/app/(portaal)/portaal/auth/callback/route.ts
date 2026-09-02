import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient, createAdminClient } from '@everts/database/server'
import { PORTAAL_MARKER_COOKIE, PORTAAL_SESSIE_MAXAGE } from '@everts/database/cookies'
import { veiligPortaalPad } from '@/lib/auth/next-pad'

/**
 * GET /portaal/auth/callback — de klantpoort.
 *
 * Spiegelbeeld van /auth/callback, met één belangrijk verschil: daar wordt
 * gecontroleerd of het e-mailadres bij een actieve medewerker hoort, hier of het
 * bij een actieve portaalgebruiker hoort. Die twee poorten staan bewust los van
 * elkaar. Een klant die op de EVA-callback belandt wordt daar geweigerd, en een
 * medewerker die hier binnenkomt zonder portaalaccount ook.
 *
 * De code-uitwisseling zet de sessie; pas daarna kijken we wie het is. Blijkt er
 * geen portaaltoegang te zijn, dan wordt de sessie meteen weer opgeruimd — anders
 * loopt iemand rond met een geldige sessie zonder ergens toegang toe te hebben.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  // Het gehashte token uit de inloglink. Bewust een gewone queryparameter en
  // geen fragment: een `#…` bereikt de server nooit. Zie maakInloglink().
  const tokenHash = searchParams.get('token_hash')
  const next = veiligPortaalPad(searchParams.get('next')) ?? '/portaal'

  if (tokenHash) {
    // Portaalsessies zijn persistent (14 dagen). De markercookie staat nog niet
    // in de inkomende request, dus forceren we het hier expliciet — anders
    // schrijft de client sessie-cookies die bij het sluiten van de browser weg zijn.
    const supabase = await createClient({
      persistentSessie: true,
      sessieMaxAge: PORTAAL_SESSIE_MAXAGE,
    })
    const { data: { user }, error } = await supabase.auth.verifyOtp({
      type: 'magiclink',
      token_hash: tokenHash,
    })

    if (!error && user?.email) {
      const admin = createAdminClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = admin as any

      const { data: gebruiker } = await db
        .from('portaal_gebruikers')
        .select('id, auth_user_id')
        .eq('email', user.email.toLowerCase())
        .eq('actief', true)
        .maybeSingle()

      if (gebruiker) {
        // Eerste login: het auth-account aan het portaalrecord knopen. Vanaf nu
        // gaat de lookup op auth_user_id in plaats van op e-mailadres.
        await db.from('portaal_gebruikers')
          .update({
            ...(gebruiker.auth_user_id ? {} : { auth_user_id: user.id }),
            laatst_ingelogd_op: new Date().toISOString(),
          })
          .eq('id', gebruiker.id)

        // Markercookie: hierdoor blijven de auth-cookies persistent bij elke
        // token-refresh, en weet de middleware waar een volgende login heen moet.
        // Puur routering en levensduur — nooit een toegangsbewijs.
        const store = await cookies()
        store.set(PORTAAL_MARKER_COOKIE, '1', {
          path: '/', sameSite: 'lax', maxAge: PORTAAL_SESSIE_MAXAGE,
        })

        return NextResponse.redirect(`${origin}${next}`)
      }
    }

    await supabase.auth.signOut()
    // Onderscheid maken tussen "link verlopen" en "adres onbekend" helpt de klant
    // en verklapt niets: hij heeft de link zelf in handen.
    const reden = error ? 'verlopen' : 'geen-toegang'
    return NextResponse.redirect(`${origin}/portaal/login?fout=${reden}`)
  }

  return NextResponse.redirect(`${origin}/portaal/login?fout=verlopen`)
}
