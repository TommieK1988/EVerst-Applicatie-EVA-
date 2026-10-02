import { getCurrentMedewerker } from '@/lib/auth/rechten'
import { haalAgendaVenster, haalMijnTaakItems } from '@/lib/agenda/mijn-agenda'
import { maandSleutel, startVenster, vandaagNl, vingerafdruk } from '@/lib/agenda/agenda-model'
import { getAppVertaler } from '@/i18n/server'
import AppHeader from '@/components/mobiel/AppHeader'
import MobielPullToRefresh from '@/components/mobiel/MobielPullToRefresh'
import AgendaClient from '@/components/mobiel/planning/AgendaClient'

export const metadata = { title: 'Agenda · EVA Mobiel' }
export const dynamic = 'force-dynamic'

/**
 * Mobiele agenda: read-only persoonlijke kalender van de ingelogde medewerker,
 * in de vorm van de iOS Agenda-app — maandrooster met stipjes boven, de
 * afspraken van de gekozen dag eronder.
 *
 * Vier bronnen komen samen (zie `lib/agenda/mijn-agenda.ts`): eigen planitems,
 * eigen verlof/ziekte, de bedrijfsagenda inclusief feestdagen, en eigen taken
 * met een deadline.
 *
 * De server rendert een venster van drie maanden; verder terug of vooruit laadt
 * de client bij via `haalAgendaMaand`.
 */
export default async function MobielPlanningPage(
  { searchParams }: { searchParams: Promise<{ dag?: string }> },
) {
  const [medewerker, t] = await Promise.all([getCurrentMedewerker(), getAppVertaler('planning')])

  if (!medewerker) {
    return (
      <>
        <AppHeader title={t('titel')} backHref="/m" />
        <div style={{ textAlign: 'center', color: '#6b757c', padding: '48px 16px', fontSize: 14 }}>
          {t('geenKoppeling')}
        </div>
      </>
    )
  }

  // `?dag=` maakt een deeplink vanuit een melding mogelijk; anders vandaag.
  const { dag } = await searchParams
  const geldigeDag = dag && /^\d{4}-\d{2}-\d{2}$/.test(dag) ? dag : null
  // Peil via de NL-dag: de server draait in UTC, en rond middernacht is dat nog gisteren.
  const vandaag = vandaagNl()
  const peil = new Date(`${geldigeDag ?? vandaag}T12:00:00`)
  const { van, tot } = startVenster(peil)

  const [vensterItems, taakItems] = await Promise.all([
    haalAgendaVenster(medewerker, van, tot),
    haalMijnTaakItems(medewerker.auth_user_id),
  ])
  const items = [...vensterItems, ...taakItems]

  return (
    <>
      <AppHeader title={t('titel')} sub={t('sub')} backHref="/m" />
      <MobielPullToRefresh />
      <AgendaClient
        items={items}
        peilMaand={maandSleutel(peil)}
        startDag={geldigeDag ?? vandaag}
        dataSleutel={vingerafdruk(items)}
      />
    </>
  )
}
