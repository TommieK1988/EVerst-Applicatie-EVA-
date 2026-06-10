import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@everts/database/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && user?.email) {
      const admin = createAdminClient()
      const { data: medewerker } = await admin
        .from('medewerkers')
        .select('id, actief, gebruiker_type, auth_user_id')
        .eq('email', user.email)
        .maybeSingle()

      if (medewerker?.actief && medewerker.gebruiker_type !== 'geen') {
        if (!medewerker.auth_user_id) {
          await admin
            .from('medewerkers')
            .update({ auth_user_id: user.id })
            .eq('id', medewerker.id)
        }
        return NextResponse.redirect(`${origin}${next}`)
      }
    }

    await supabase.auth.signOut()
  }

  return NextResponse.redirect(`${origin}/login?fout=geen-toegang`)
}
