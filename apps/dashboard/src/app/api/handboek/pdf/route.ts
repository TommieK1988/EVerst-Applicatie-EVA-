import { NextRequest, NextResponse } from 'next/server'
import { GeenToegangError, vereisRecht } from '@/lib/auth/rechten'
import { FEATURES } from '@/lib/features'
import { bouwHandboekPdf } from '@/lib/handboek/pdf'

export const dynamic = 'force-dynamic'
// Logo ophalen, omzetten met sharp en een document van tientallen pagina's
// opbouwen past niet altijd in de standaardlimiet.
export const maxDuration = 60

/**
 * GET /api/handboek/pdf?kenmerken=intern,kantoor&naam=Eigen%20personeel
 *
 * Het handboek als papieren versie, voor één profiel.
 *
 * Waarom het profiel in de URL staat en niet uit de ingelogde gebruiker komt:
 * dit is juist bedoeld om het handboek van een ánder af te drukken — HR geeft
 * een nieuwe flexkracht de flexversie mee, niet zijn eigen kantoorversie.
 * Daarom leest de opbouw met de admin-client en filtert hij in TypeScript;
 * RLS kent alleen de ingelogde gebruiker.
 *
 * En daarom hangt deze route aan het BEHEER-recht en niet aan "je bent
 * ingelogd": wie hier een willekeurig profiel mag kiezen, mag ook de interne
 * tekst zien die voor hemzelf verborgen is.
 */
export async function GET(req: NextRequest) {
  if (!FEATURES.handboek) return new NextResponse('Niet gevonden', { status: 404 })

  try {
    await vereisRecht('medewerkershandboek', 'lezen')
  } catch (e) {
    if (e instanceof GeenToegangError) return new NextResponse('Geen toegang', { status: 403 })
    throw e
  }

  const params = req.nextUrl.searchParams
  const kenmerken = new Set(
    (params.get('kenmerken') ?? 'intern,kantoor')
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean),
  )
  const naam = (params.get('naam') ?? 'Volledig').slice(0, 60)

  const { bytes, bestandsnaam } = await bouwHandboekPdf(kenmerken, naam)

  // Buffer en niet de kale Uint8Array: die laatste is in deze TS-versie geen
  // geldige BodyInit.
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      // attachment: dit is een uitdraai om te printen of mee te geven, geen
      // scherm om in te lezen — daarvoor is de app.
      'Content-Disposition': `attachment; filename="${encodeURIComponent(bestandsnaam)}"`,
      'Cache-Control': 'no-store',
    },
  })
}
