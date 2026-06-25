import { NextRequest } from 'next/server'
import { runCronSync } from '@/lib/bouw7/run-cron-sync'

// Sync kan lang duren (Athena-calls per project) — ruim timeout-budget vragen.
export const maxDuration = 300
export const dynamic = 'force-dynamic'

/**
 * GET|POST /api/cron/bouw7-sync?mode=incremental|full
 *
 * Handmatige / fallback-ingang (default = incremental). De geplande Vercel Cron
 * gebruikt de pad-variant /api/cron/bouw7-sync/full en /api/cron/bouw7-sync/incremental
 * (Vercel Cron registreert paden met `?query=` niet). Zie apps/dashboard/vercel.json.
 *
 * Beveiliging: Authorization: Bearer <CRON_SECRET>.
 */
async function handle(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get('mode') === 'full' ? 'full' : 'incremental'
  return runCronSync(req, mode)
}

export const GET = handle
export const POST = handle
