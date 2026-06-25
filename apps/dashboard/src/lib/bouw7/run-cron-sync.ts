import { NextRequest, NextResponse } from 'next/server'
import { runFullSync } from '@/app/(platform)/instellingen/integraties/actions'
import { syncManagementProjecten } from '@/lib/bouw7/sync-management'
import type { SyncMode } from '@/lib/bouw7/sync'

/**
 * Gedeelde uitvoering achter de cron-endpoints. Beveiligt met CRON_SECRET (Bearer)
 * en draait de volledige Bouw7-sync + management-dashboard.
 *
 *   1. runFullSync(mode)         → relaties, contactpersonen, medewerkers, dossiers, planning
 *   2. syncManagementProjecten() → management_projecten (KPI-dashboard)
 *
 * `full` (ochtend) = drift-correctie; `incremental` (middag) = alleen gewijzigde records.
 */
export async function runCronSync(req: NextRequest, mode: SyncMode): Promise<NextResponse> {
  const auth = req.headers.get('authorization')
  const secret = process.env.CRON_SECRET

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = Date.now()

  const full = await runFullSync(mode)
  if (!full.ok) {
    return NextResponse.json(
      { ok: false, fase: 'runFullSync', error: full.error, duur_ms: Date.now() - startedAt },
      { status: 500 },
    )
  }

  const management = await syncManagementProjecten()

  return NextResponse.json(
    {
      ok: true,
      mode,
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
