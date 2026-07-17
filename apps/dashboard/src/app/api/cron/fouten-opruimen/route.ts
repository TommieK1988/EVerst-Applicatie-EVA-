import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@everts/database/server'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

/** Afgevinkte fouten mogen sneller weg dan openstaande. */
const DAGEN_OPGELOST = 30
const DAGEN_ALLES = 90

function dagenGeleden(dagen: number): string {
  return new Date(Date.now() - dagen * 24 * 60 * 60 * 1000).toISOString()
}

/**
 * GET|POST /api/cron/fouten-opruimen
 *
 * Houdt het foutenlogboek (/instellingen/foutenlog) hanteerbaar: afgevinkte fouten
 * verdwijnen na 30 dagen, al het overige na 90. Zonder dit groeit de tabel eeuwig door.
 * Geregistreerd als Vercel Cron (dagelijks 03:00, zie apps/dashboard/vercel.json).
 * Vercel Cron stuurt GET; POST is voor handmatig testen met curl.
 *
 * Beveiliging: Authorization: Bearer <CRON_SECRET>.
 */
async function handle(req: NextRequest): Promise<NextResponse> {
  const auth = req.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = Date.now()
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any

    const { data: opgeloste, error: fout1 } = await admin
      .from('fout_logboek')
      .delete()
      .eq('opgelost', true)
      .lt('laatst_op', dagenGeleden(DAGEN_OPGELOST))
      .select('id')
    if (fout1) throw new Error(fout1.message)

    const { data: oude, error: fout2 } = await admin
      .from('fout_logboek')
      .delete()
      .lt('laatst_op', dagenGeleden(DAGEN_ALLES))
      .select('id')
    if (fout2) throw new Error(fout2.message)

    return NextResponse.json({
      ok: true,
      verwijderd_opgelost: opgeloste?.length ?? 0,
      verwijderd_verlopen: oude?.length ?? 0,
      duur_ms: Date.now() - startedAt,
    })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err), duur_ms: Date.now() - startedAt },
      { status: 500 },
    )
  }
}

export const GET = handle
export const POST = handle
