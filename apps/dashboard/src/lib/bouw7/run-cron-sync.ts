import { NextRequest, NextResponse } from 'next/server'
import { runFullSync } from '@/app/(platform)/instellingen/integraties/actions'
import { syncManagementProjecten } from '@/lib/bouw7/sync-management'
import { geocodeDossiers } from '@/lib/dossiers/geocode'
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

  const management = await syncManagementProjecten(mode)

  // Werkadres-coördinaten bijwerken voor "dossier openen op locatie" (mobiel).
  // Best-effort: Nominatim throttelt op ~1/s, dus per ronde begrensd — de
  // gesynchte dossiers stromen zo over meerdere cron-rondes vol. Een fout hier
  // (bijv. Nominatim onbereikbaar) mag de sync niet laten mislukken.
  let geocode: unknown
  try {
    geocode = await geocodeDossiers({ max: 40 })
  } catch (e) {
    geocode = { error: e instanceof Error ? e.message : String(e) }
  }

  return NextResponse.json(
    {
      ok: true,
      mode,
      contacts: full.contacts,
      employees: full.employees,
      daysOff: full.daysOff,
      projects: full.projects,
      planning: full.planning,
      management,
      geocode,
      duur_ms: Date.now() - startedAt,
    },
    { status: 200 },
  )
}
