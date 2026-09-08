import { NextRequest, NextResponse } from 'next/server'
import { cronLogboek } from '@/lib/cron/logboek'
import { runFullSync } from '@/app/(platform)/instellingen/integraties/actions'
import { syncManagementProjecten } from '@/lib/bouw7/sync-management'
import { geocodeDossiers } from '@/lib/dossiers/geocode'
import type { SyncMode } from '@/lib/bouw7/sync'
import { amsterdamUur } from '@/lib/cron/lokaal-venster'

/**
 * Beoogde lokale (Europe/Amsterdam) starttijd per mode. Vercel Cron draait alleen in
 * UTC en volgt géén zomer-/wintertijd, daarom vuurt de cron op beide kandidaat-UTC-uren
 * (zie apps/dashboard/vercel.json) en laat deze guard alleen de uitvoering door die op
 * het juiste lokale uur valt. Zo draait de sync het hele jaar om 06:30 resp. 12:45,
 * ongeacht DST.
 */
const DOEL_LOKAAL_UUR: Record<SyncMode, number> = {
  full: 6, // 06:30 lokaal
  incremental: 12, // 12:45 lokaal
}

/**
 * Gedeelde uitvoering achter de cron-endpoints. Beveiligt met CRON_SECRET (Bearer)
 * en draait de volledige Bouw7-sync + management-dashboard.
 *
 *   1. runFullSync(mode)         → relaties, contactpersonen, medewerkers, dossiers, planning
 *   2. syncManagementProjecten() → management_projecten (KPI-dashboard)
 *
 * `full` (ochtend) = drift-correctie; `incremental` (middag) = alleen gewijzigde records.
 *
 * `enforceLocalWindow` (alleen de geplande Vercel Cron zet dit): sla over als het huidige
 * lokale uur niet het beoogde uur is — de tegenhanger-firing (1 uur ernaast in UTC) draait
 * dan wél. Handmatige aanroepen (curl, fallback-route) zetten dit niet en draaien altijd.
 */
export async function runCronSync(
  req: NextRequest,
  mode: SyncMode,
  { enforceLocalWindow = false }: { enforceLocalWindow?: boolean } = {},
): Promise<NextResponse> {
  const auth = req.headers.get('authorization')
  const secret = process.env.CRON_SECRET

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (enforceLocalWindow) {
    const uur = amsterdamUur(new Date())
    if (uur !== DOEL_LOKAAL_UUR[mode]) {
      // 200 zodat Vercel deze (bedoelde) no-op niet als mislukte cron markeert.
      console.log(`[cron bouw7-sync/${mode}] overgeslagen — buiten lokaal venster (${uur}:xx)`)
      return NextResponse.json(
        { ok: true, skipped: true, mode, reason: `buiten lokaal venster (${uur}:xx ≠ ${DOEL_LOKAAL_UUR[mode]}:xx Amsterdam)` },
        { status: 200 },
      )
    }
  }

  const log = cronLogboek(`bouw7-sync/${mode}`)
  const startedAt = Date.now()

  log.stap('runFullSync')
  const full = await runFullSync(mode)
  if (!full.ok) {
    log.mislukt(full.error)
    return NextResponse.json(
      { ok: false, fase: 'runFullSync', error: full.error, duur_ms: Date.now() - startedAt },
      { status: 500 },
    )
  }

  log.stap('syncManagementProjecten')
  const management = await syncManagementProjecten(mode)

  // Werkadres-coördinaten bijwerken voor "dossier openen op locatie" (mobiel).
  // Best-effort: Nominatim throttelt op ~1/s, dus per ronde begrensd — de
  // gesynchte dossiers stromen zo over meerdere cron-rondes vol. Een fout hier
  // (bijv. Nominatim onbereikbaar) mag de sync niet laten mislukken.
  let geocode: unknown
  log.stap('geocodeDossiers')
  try {
    geocode = await geocodeDossiers({ max: 40 })
  } catch (e) {
    geocode = { error: e instanceof Error ? e.message : String(e) }
  }

  log.klaar({ mode, projecten: full.projects })

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
