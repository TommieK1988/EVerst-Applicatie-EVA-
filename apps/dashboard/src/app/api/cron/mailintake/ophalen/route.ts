import { NextRequest, NextResponse } from 'next/server'

import { cronLogboek } from '@/lib/cron/logboek'
import { haalAllePostbussenOp } from '@/lib/mailintake/ophalen'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

/**
 * GET|POST /api/cron/mailintake/ophalen
 *
 * Haalt nieuwe berichten en hun bijlagen uit de intakepostbussen. Doet verder
 * niets: geen AI, geen besluiten. Die scheiding is er zodat deze stap kort en
 * betrouwbaar blijft — hij draait elke tien minuten, en als hij faalt mag er
 * niets half verwerkt achterblijven.
 *
 * Dubbel ophalen is onschadelijk: de unieke index (postbus_id,
 * internet_message_id) vangt de overlap van het pollvenster op.
 *
 * Beveiliging: Authorization: Bearer <CRON_SECRET>.
 */
async function handle(req: NextRequest): Promise<NextResponse> {
  const auth = req.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const log = cronLogboek('mailintake-ophalen')
  try {
    log.stap('postbussen ophalen')
    const resultaten = await haalAllePostbussenOp()

    const nieuw = resultaten.reduce((s, r) => s + r.nieuw, 0)
    const fouten = resultaten.filter(r => r.fout)

    log.klaar({ postbussen: resultaten.length, nieuw, fouten: fouten.length })
    return NextResponse.json({
      ok: fouten.length === 0,
      nieuw,
      postbussen: resultaten,
      duurMs: log.duurMs(),
    })
  } catch (e) {
    log.mislukt(e)
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}

export const GET = handle
export const POST = handle
