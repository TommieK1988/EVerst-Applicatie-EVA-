import { NextResponse } from 'next/server'
import { pushBeschikbaar } from '@/lib/notificaties/push'

export const dynamic = 'force-dynamic'

/**
 * Geeft de publieke VAPID-sleutel die de browser nodig heeft om zich te abonneren.
 *
 * Waarom een route en geen NEXT_PUBLIC_-variabele: dan hoeft de sleutel niet in de
 * build te zitten en kan hij worden vervangen zonder opnieuw te deployen. De sleutel
 * is publiek — hij zit per definitie in elk pushabonnement.
 */
export async function GET() {
  if (!pushBeschikbaar()) {
    return NextResponse.json({ beschikbaar: false })
  }
  return NextResponse.json({
    beschikbaar: true,
    publicKey: process.env.VAPID_PUBLIC_KEY,
  })
}
