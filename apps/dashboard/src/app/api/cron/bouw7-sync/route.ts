import { NextRequest, NextResponse } from 'next/server'
import { runFullSync } from '@/app/(platform)/instellingen/integraties/actions'
import { syncManagementProjecten } from '@/lib/bouw7/sync-management'

// Sync kan lang duren (Athena-calls per project) — ruim timeout-budget vragen.
export const maxDuration = 300
export const dynamic = 'force-dynamic'

/**
 * POST /api/cron/bouw7-sync
 *
 * Beschermde endpoint die de volledige Bouw7-sync uitvoert:
 *   1. runFullSync()            → relaties, contactpersonen, medewerkers, dossiers, planning
 *   2. syncManagementProjecten() → management_projecten (KPI-dashboard)
 *
 * Wordt 2× per dag aangeroepen (06:30 + 12:45 NL) door de Supabase Edge Functions
 * 'bouw7-sync-ochtend' en 'bouw7-sync-middag'.
 *
 * Beveiliging: Authorization: Bearer <CRON_SECRET>
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const secret = process.env.CRON_SECRET

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = Date.now()

  // 1. Volledige sync (relaties → medewerkers → dossiers → planning).
  const full = await runFullSync()
  if (!full.ok) {
    return NextResponse.json(
      { ok: false, fase: 'runFullSync', error: full.error, duur_ms: Date.now() - startedAt },
      { status: 500 },
    )
  }

  // 2. Management-dashboard afgeleide data verversen.
  const management = await syncManagementProjecten()

  return NextResponse.json(
    {
      ok: true,
      contacts: full.contacts,
      employees: full.employees,
      projects: full.projects,
      planning: full.planning,
      management,
      duur_ms: Date.now() - startedAt,
    },
    { status: 200 },
  )
}
