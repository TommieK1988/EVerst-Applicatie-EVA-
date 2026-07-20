import { NextRequest, NextResponse } from 'next/server'
import { stuurWagenparkDagoverzicht } from '@/lib/wagenpark/dagoverzicht'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

/**
 * GET|POST /api/cron/wagenpark-dagoverzicht
 *
 * Stuurt de dagelijkse aanwezigheids-samenvatting (te laat / te vroeg) naar
 * Directie/beheer. Geregistreerd als Vercel Cron op werkdagen 07:00 (zie
 * apps/dashboard/vercel.json), ná de dagelijkse ULU-rittensync.
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
    const resultaat = await stuurWagenparkDagoverzicht()
    return NextResponse.json({ ok: true, ...resultaat, duur_ms: Date.now() - startedAt })
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        duur_ms: Date.now() - startedAt,
      },
      { status: 500 },
    )
  }
}

export const GET = handle
export const POST = handle
