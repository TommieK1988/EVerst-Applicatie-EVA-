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
 * het juiste lokale uur valt. Zo draait de sync het hele jaar om 02:30 resp. 12:30,
 * ongeacht DST.
 *
 * **Die twee UTC-uren moeten H-2 en H-1 zijn** (zomertijd is UTC+2, wintertijd UTC+1).
 * Staan ze ergens anders, dan valt géén van beide firings in het venster en draait de
 * cron het hele jaar niet — stil, want een overgeslagen run logt niets. Dat is tussen
 * 9 september en 22 september 2026 met de full sync gebeurd. Verzet je een tijd hier,
 * verzet dan het paar in vercel.json mee.
 */
const DOEL_LOKAAL_UUR: Record<SyncMode, number> = {
  full: 2, // 02:30 lokaal — zwaar werk buiten kantooruren (UTC 00:30 zomer / 01:30 winter)
  incremental: 12, // 12:30 lokaal (UTC 10:30 zomer / 11:30 winter)
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

  // Offertebewaking gelijktrekken met de actielijst. Draait ná de sync, want die kan zelf
  // dossiers in of uit de offertefase brengen en acties uit Bouw7 meebrengen. Het scherm werkt
  // ook zonder deze ronde bij — aanmaken en afvinken van een actie stemmen de kaart meteen af —
  // maar een deadline die elders verschuift, of een dossier dat vanuit Bouw7 in de offertefase
  // belandt, komt alleen hier langs. Best-effort: een fout mag de sync niet laten mislukken.
  let offertebewaking: unknown
  log.stap('offertebewaking')
  try {
    const { synchroniseerBewakingUitActies } = await import('@/lib/commercie/nabel-sync')
    offertebewaking = await synchroniseerBewakingUitActies()
  } catch (e) {
    offertebewaking = { error: e instanceof Error ? e.message : String(e) }
  }

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

  // SharePoint-dossiermappen bijwerken. Bewust ná de sync en niet erin: een Graph-storing
  // mag de sync niet vertragen, en beide nalopen herstellen zichzelf — wat nu niet lukt
  // staat morgen weer in de selectie.
  //  - hernoemen: dossiers waarvan de projectnaam wijzigde (in EVA of in Bouw7);
  //  - aanmaken:  aanvragen waarvan het dossiernummer pas later uit Bouw7 kwam.
  let dossiermappen: unknown
  log.stap('dossiermappen')
  try {
    const { hernoemVerouderdeDossierMappen, maakOntbrekendeDossierMappen } = await import(
      '@/lib/o365/dossiermap-naam'
    )
    const [hernoemd, aangemaakt] = [
      await hernoemVerouderdeDossierMappen({ max: 50 }),
      await maakOntbrekendeDossierMappen({ max: 25 }),
    ]
    dossiermappen = { hernoemd, aangemaakt }
  } catch (e) {
    dossiermappen = { error: e instanceof Error ? e.message : String(e) }
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
      offertebewaking,
      geocode,
      dossiermappen,
      duur_ms: Date.now() - startedAt,
    },
    { status: 200 },
  )
}
