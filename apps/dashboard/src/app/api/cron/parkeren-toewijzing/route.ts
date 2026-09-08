import { NextRequest, NextResponse } from 'next/server'
import { voerParkeerToewijzingUit } from '@/lib/wagenpark/parkeren-toewijzing'
import { geocodeStopAdressen } from '@/lib/wagenpark/geocode-ritten'
import { cronLogboek } from '@/lib/cron/logboek'

// De geocode-stap praat met Nominatim op ~1 verzoek per seconde; met een
// bescheiden batch blijft dat ruim binnen de tijd, maar krap is het niet.
export const maxDuration = 300
export const dynamic = 'force-dynamic'

/**
 * GET|POST /api/cron/parkeren-toewijzing
 *
 * Koppelt parkeerkosten aan het dossier waar ze bij horen. Geregistreerd als
 * Vercel Cron (zie apps/dashboard/vercel.json), na de ULU-rittensync en de
 * Bouw7-sync — die leveren de ritten en de planning waarop de toewijzing steunt.
 *
 * WAAROM DIT ELKE DAG OVER EEN HEEL VENSTER LOOPT, en niet alleen over nieuwe
 * regels: de parkeer-export komt dagelijks binnen, maar de planning schuift en
 * uren worden pas later in de week ingevuld en goedgekeurd. Een parkeerkost die
 * vandaag nergens bij past, kan volgende week een duidelijk project hebben. Een
 * al bevestigde toewijzing wordt daarbij nooit aangeraakt.
 *
 * De geocode-stap ervoor vertaalt rit-stopadressen naar coördinaten. Zonder die
 * coördinaten heeft de toewijzing geen geografisch signaal en belandt vrijwel
 * alles in de werkvoorraad. De adressen bij een parkeerkost gaan voor.
 *
 * Beveiliging: Authorization: Bearer <CRON_SECRET>.
 */
async function handle(req: NextRequest): Promise<NextResponse> {
  const auth = req.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const log = cronLogboek('parkeren-toewijzing')
  try {
    log.stap('stopadressen geocoderen')
    // Best-effort: mislukt de geocodering, dan draait de toewijzing gewoon door
    // met de coördinaten die er al zijn.
    let geocode: Awaited<ReturnType<typeof geocodeStopAdressen>> | null = null
    try {
      geocode = await geocodeStopAdressen({ max: 120 })
    } catch (err) {
      log.stap(`geocoderen overgeslagen: ${err instanceof Error ? err.message : String(err)}`)
    }

    log.stap('parkeerkosten toewijzen')
    const toewijzing = await voerParkeerToewijzingUit()

    log.klaar({
      automatisch: toewijzing.automatisch,
      werkvoorraad: toewijzing.werkvoorraad,
      geocodeGevonden: geocode?.gevonden ?? 0,
    })
    return NextResponse.json(
      { ok: true, geocode, toewijzing, duur_ms: log.duurMs() },
      { status: 200 },
    )
  } catch (err) {
    log.mislukt(err)
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err), duur_ms: log.duurMs() },
      { status: 500 },
    )
  }
}

export const GET = handle
export const POST = handle
