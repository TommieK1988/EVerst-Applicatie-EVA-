import { NextResponse } from 'next/server'
import { createClient } from '@everts/database/server'
import { stuurPush } from '@/lib/notificaties/push'

export const dynamic = 'force-dynamic'

/**
 * Stuurt een testmelding naar de eigen apparaten. Bedoeld voor de knop op
 * "Mijn gegevens" / "Mijn account": zonder zo'n knop merk je pas dat push níét werkt
 * op het moment dat je een echte melding mist.
 *
 * De testmelding gaat bewust NIET als rij naar `notificaties` — anders staat het
 * belletje vol met testberichten.
 */
export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

    const aantal = await stuurPush(user.id, {
      titel: 'EVA — testmelding',
      body:  'Pushmeldingen werken op dit apparaat.',
      url:   '/',
      type:  'algemeen',
    })

    return NextResponse.json({ ok: aantal > 0, aantal })
  } catch {
    return NextResponse.json({ error: 'Versturen mislukt' }, { status: 500 })
  }
}
