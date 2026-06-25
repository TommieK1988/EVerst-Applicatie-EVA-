import { NextRequest } from 'next/server'
import { runCronSync } from '@/lib/bouw7/run-cron-sync'

// Sync kan lang duren (Athena-calls per project) — ruim timeout-budget vragen.
export const maxDuration = 300
export const dynamic = 'force-dynamic'

/**
 * GET|POST /api/cron/bouw7-sync/full | /api/cron/bouw7-sync/incremental
 *
 * Doel van Vercel Cron (zie apps/dashboard/vercel.json). De mode zit in het PAD
 * (niet in een query-string — Vercel Cron registreert paden met `?query=` niet).
 * Vercel Cron stuurt GET; POST is voor handmatig testen met curl.
 *
 * Beveiliging: Authorization: Bearer <CRON_SECRET> (door Vercel automatisch gezet).
 */
async function handle(req: NextRequest, ctx: { params: { mode: string } }) {
  const mode = ctx.params.mode === 'full' ? 'full' : 'incremental'
  return runCronSync(req, mode)
}

export const GET = handle
export const POST = handle
