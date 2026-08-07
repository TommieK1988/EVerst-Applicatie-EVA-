import { NextResponse, type NextRequest } from 'next/server'
import { createClient, createAdminClient } from '@everts/database/server'

export const dynamic = 'force-dynamic'

/**
 * Zet pushmeldingen uit voor dit apparaat.
 *
 * De verwijdering is gebonden aan de ingelogde gebruiker: je kunt alleen je eigen
 * abonnement opzeggen, niet dat van een collega door zijn endpoint te raden.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

    const body = await req.json() as { endpoint?: unknown }
    const endpoint = typeof body.endpoint === 'string' ? body.endpoint : ''
    if (!endpoint) return NextResponse.json({ error: 'Geen endpoint' }, { status: 400 })

    const admin = createAdminClient()
    await admin
      .from('push_abonnementen')
      .delete()
      .eq('endpoint', endpoint)
      .eq('user_id', user.id)

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Afmelden mislukt' }, { status: 500 })
  }
}
