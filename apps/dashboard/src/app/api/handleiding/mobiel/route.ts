import { NextResponse } from 'next/server'
import { getCurrentMedewerker } from '@/lib/auth/rechten'
import { bouwMobieleHandleidingPdf } from '@/lib/handleiding/pdf'

export const dynamic = 'force-dynamic'
// Het logo ophalen en omzetten met sharp kost de eerste keer even; de standaardlimiet is dan krap.
export const maxDuration = 60

/**
 * GET /api/handleiding/mobiel
 *
 * De handleiding voor EVA Mobiel als PDF. Dezelfde uitdraai die als bijlage bij de
 * uitnodigingsmail gaat, zodat iemand die hem kwijt is er zelf bij kan zonder kantoor te bellen.
 *
 * Hangt bewust aan géén enkel recht, alleen aan "je bent een medewerker met een account": er staat
 * niets in wat iemand met een EVA-account niet mag weten — het beschrijft precies de schermen die
 * hij zelf al open kan klikken. Een recht zou hier alleen betekenen dat degene die hem het hardst
 * nodig heeft, de nieuwe monteur, er niet bij kan.
 */
export async function GET() {
  const medewerker = await getCurrentMedewerker()
  if (!medewerker || medewerker.gebruiker_type === 'geen') {
    return new NextResponse('Geen toegang', { status: 403 })
  }

  const { bytes, bestandsnaam } = await bouwMobieleHandleidingPdf()

  // Buffer en niet de kale Uint8Array: die laatste is in deze TS-versie geen geldige BodyInit.
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      // inline: op een telefoon wil je hem lezen, niet eerst downloaden en dan opzoeken.
      'Content-Disposition': `inline; filename="${encodeURIComponent(bestandsnaam)}"`,
      'Cache-Control': 'no-store',
    },
  })
}
