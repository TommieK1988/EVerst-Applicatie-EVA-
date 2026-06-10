import { NextRequest, NextResponse } from 'next/server'
import { syncUluAction } from '@/app/actions/ulu-sync'

/**
 * POST /api/cron/ulu-sync
 *
 * Beschermde endpoint die de ULU API-sync uitvoert.
 * Wordt dagelijks om 06:00 aangeroepen door de Supabase Edge Function 'daily-sync'.
 *
 * Beveiliging: Authorization: Bearer <CRON_SECRET>
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const secret = process.env.CRON_SECRET

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await syncUluAction()

  return NextResponse.json(result, { status: result.ok ? 200 : 500 })
}
