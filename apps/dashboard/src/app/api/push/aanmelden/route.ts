import { NextResponse, type NextRequest } from 'next/server'
import { createClient, createAdminClient } from '@everts/database/server'

export const dynamic = 'force-dynamic'

/**
 * Legt het pushabonnement van dit apparaat vast.
 *
 * De gebruiker komt uit de sessie, niet uit de body — anders kan een aanroeper zijn
 * eigen telefoon onder de naam van een collega abonneren en diens meldingen meelezen.
 *
 * Het endpoint is uniek: opnieuw aanmelden op hetzelfde toestel werkt de bestaande rij
 * bij (ook als het toestel intussen door iemand anders gebruikt wordt — dan verhuist
 * het abonnement mee naar de nieuwe eigenaar).
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

    const body = await req.json() as {
      endpoint?: unknown
      keys?: { p256dh?: unknown; auth?: unknown }
    }

    const endpoint = typeof body.endpoint === 'string' ? body.endpoint : ''
    const p256dh   = typeof body.keys?.p256dh === 'string' ? body.keys.p256dh : ''
    const auth     = typeof body.keys?.auth === 'string' ? body.keys.auth : ''

    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json({ error: 'Onvolledig abonnement' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { error } = await admin
      .from('push_abonnementen')
      .upsert({
        user_id:    user.id,
        endpoint,
        p256dh,
        auth,
        user_agent: req.headers.get('user-agent')?.slice(0, 300) ?? null,
      }, { onConflict: 'endpoint' })

    if (error) {
      return NextResponse.json({ error: 'Aanmelden mislukt' }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Aanmelden mislukt' }, { status: 500 })
  }
}
