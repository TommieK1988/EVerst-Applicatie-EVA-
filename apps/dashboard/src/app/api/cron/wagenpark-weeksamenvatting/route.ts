import { NextRequest, NextResponse } from 'next/server'
import { stuurWagenparkWeeksamenvatting } from '@/lib/wagenpark/weeksamenvatting'

// Aggregatie over veel bestuurders + inserts — ruim timeout-budget.
export const maxDuration = 120
export const dynamic = 'force-dynamic'

/**
 * GET|POST /api/cron/wagenpark-weeksamenvatting
 *
 * Wekelijkse in-app samenvatting (rijgedrag + parkeerkosten) per bestuurder,
 * naar de gekoppelde medewerker. Geregistreerd als Vercel Cron (maandag 07:00,
 * zie apps/dashboard/vercel.json). Vercel Cron stuurt GET; POST is voor
 * handmatig testen met curl.
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
    const result = await stuurWagenparkWeeksamenvatting()
    return NextResponse.json({ ok: true, ...result, duur_ms: Date.now() - startedAt }, { status: 200 })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err), duur_ms: Date.now() - startedAt },
      { status: 500 },
    )
  }
}

export const GET = handle
export const POST = handle
