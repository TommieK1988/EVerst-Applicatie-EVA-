import { NextResponse, type NextRequest } from 'next/server'
import { getCurrentMedewerker } from '@/lib/auth/rechten'
import { logFout } from '@/lib/fouten/log'

export const dynamic = 'force-dynamic'

/** Ruim genoeg voor een stacktrace, krap genoeg om er geen dumpplek van te maken. */
const MAX_BODY = 16 * 1024

/**
 * Ontvangt fouten die in de browser van de gebruiker klapten (zie lib/fouten/meld-client.ts).
 *
 * Sessie is verplicht: dit is een schrijfroute naar de database, en zonder gate is het
 * een open kanaal om de tabel vol te schrijven. EVA zit toch al volledig achter login,
 * dus dat kost niets. De medewerker komt uit de sessie, niet uit de body — anders kan
 * een aanroeper een fout op naam van een collega zetten.
 */
export async function POST(req: NextRequest) {
  try {
    const medewerker = await getCurrentMedewerker()
    if (!medewerker) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

    const rauw = await req.text()
    if (rauw.length > MAX_BODY) {
      return NextResponse.json({ error: 'Melding te groot' }, { status: 413 })
    }

    const body = JSON.parse(rauw) as Record<string, unknown>
    const melding = typeof body.melding === 'string' ? body.melding : ''
    if (!melding.trim()) return NextResponse.json({ error: 'Geen melding' }, { status: 400 })

    const tekst = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null)

    await logFout({
      omgeving: 'browser',
      bron: tekst(body.bron) ?? tekst(body.url) ?? 'browser',
      melding,
      fout_type: tekst(body.fout_type),
      stack: tekst(body.stack),
      digest: tekst(body.digest),
      url: tekst(body.url),
      medewerker_id: medewerker.id,
      extra: { userAgent: req.headers.get('user-agent') },
    })

    return NextResponse.json({ ok: true })
  } catch {
    // Ook hier: nooit hard falen. De client kan er toch niets mee.
    return NextResponse.json({ ok: false }, { status: 200 })
  }
}
