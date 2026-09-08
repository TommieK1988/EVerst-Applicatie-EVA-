import { NextRequest, NextResponse } from 'next/server'
import { voerUluSync } from '@/lib/wagenpark/ulu-sync-kern'
import { cronLogboek } from '@/lib/cron/logboek'

// 28 voertuigen × een API-call, plus de compliance-ronde over een heel jaar aan
// ritten. Ruim budget; de sync zelf duurde bij meting enkele tientallen seconden.
export const maxDuration = 300
export const dynamic = 'force-dynamic'

/**
 * GET|POST /api/cron/ulu-sync
 *
 * Dagelijkse ULU-rittensync. Geregistreerd als Vercel Cron (zie
 * apps/dashboard/vercel.json). Vercel Cron stuurt GET; POST is voor handmatig
 * testen met curl.
 *
 * WAAROM DIT MOET DRAAIEN — de ULU API geeft maar ongeveer één week aan ritten
 * terug en negeert datumfilters (gemeten 8 sep 2026, zie
 * packages/wagenpark-core/src/ulu-api/client.ts). Wat je niet binnen die week
 * ophaalt, is via de API definitief weg en kan alleen nog met een Excel-export
 * uit ULU worden ingelezen. Precies dat gebeurde tussen 23 juli en 31 augustus
 * 2026: zes weken geen sync, zes weken geen ritten, en elk scherm dat op ritten
 * rekent toonde die periode als "niets aan de hand".
 *
 * Er staan bewust twee slots per dag in vercel.json. De sync is idempotent
 * (upsert op kenteken + datum + tijd), dus een tweede ronde kost alleen tijd en
 * vangt een mislukte eerste op.
 *
 * Beveiliging: Authorization: Bearer <CRON_SECRET>.
 */
async function handle(req: NextRequest): Promise<NextResponse> {
  const auth = req.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const log = cronLogboek('ulu-sync')
  try {
    // Vanaf 1 januari vragen heeft geen zin voor de API — die geeft toch alleen
    // de laatste week — maar het kost niets en houdt de import-registratie
    // gelijk aan wat de knop in de app doet.
    log.stap('ulu ophalen + wegschrijven')
    const res = await voerUluSync()
    if (!res.ok) {
      log.mislukt(res.error)
      return NextResponse.json({ ...res, duur_ms: log.duurMs() }, { status: 500 })
    }
    log.klaar({ tripsNieuw: res.tripsNieuw, bevindingen: res.bevindingen })
    return NextResponse.json({ ...res, duur_ms: log.duurMs() }, { status: 200 })
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
