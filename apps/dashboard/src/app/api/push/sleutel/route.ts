import { NextResponse } from 'next/server'
import { pushBeschikbaar } from '@/lib/notificaties/push'

export const dynamic = 'force-dynamic'

/**
 * Geeft de publieke VAPID-sleutel die de browser nodig heeft om zich te abonneren.
 *
 * Waarom een route en geen NEXT_PUBLIC_-variabele: dan hoeft de sleutel niet in de
 * build te zitten en kan hij worden vervangen zonder opnieuw te deployen. De sleutel
 * is publiek — hij zit per definitie in elk pushabonnement.
 *
 * Werkt het niet, dan gaat de reden mee naar het scherm. Niet de sleutels zelf, wel
 * of ze ontbreken of worden afgewezen — anders is "staat niet ingesteld" het enige
 * dat je hebt en zoek je in de verkeerde hoek.
 */
export async function GET() {
  const stand = pushBeschikbaar()
  if (!stand.ok) {
    return NextResponse.json({ beschikbaar: false, reden: stand.reden })
  }
  return NextResponse.json({
    beschikbaar: true,
    publicKey: process.env.VAPID_PUBLIC_KEY,
  })
}
