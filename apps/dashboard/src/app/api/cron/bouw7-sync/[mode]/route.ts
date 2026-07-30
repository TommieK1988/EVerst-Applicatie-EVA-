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
 * De cron vuurt op twee UTC-tijden per dag (één uur uit elkaar) zodat er het hele jaar
 * één op het beoogde lokale uur (Amsterdam) valt; de andere firing wordt door de
 * lokale-tijd-guard in runCronSync overgeslagen. Daarom dwingt alleen GET (= Vercel Cron)
 * dat venster af. POST (curl-test) draait altijd, ongeacht tijdstip.
 *
 * Beveiliging: Authorization: Bearer <CRON_SECRET> (door Vercel automatisch gezet).
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ mode: string }> }) {
  const { mode } = await ctx.params
  return runCronSync(req, mode === 'full' ? 'full' : 'incremental', { enforceLocalWindow: true })
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ mode: string }> }) {
  const { mode } = await ctx.params
  return runCronSync(req, mode === 'full' ? 'full' : 'incremental')
}
