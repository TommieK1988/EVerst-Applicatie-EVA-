import { getCurrentMedewerker } from '@/lib/auth/rechten'
import AppHeader from '@/components/mobiel/AppHeader'
import MobielPullToRefresh from '@/components/mobiel/MobielPullToRefresh'
import VerlofClient from '@/components/mobiel/uren/VerlofClient'
import { getMijnVerlof, getVerlofSoorten } from '@/lib/uren/verlof'
import { getIngeplandVerlof } from '@/lib/uren/afwezigheid-mobiel'
import { berekenTvtSaldo } from '@/lib/uren/tvt-saldo'
import { getAppVertaler } from '@/i18n/server'

export const metadata = { title: 'Verlof · EVA Mobiel' }
export const dynamic = 'force-dynamic'

/**
 * Verlof aanvragen en je eigen aanvragen volgen, naast al het verlof dat al in de planning staat
 * (ook wat via Bouw7 is ingevoerd). Goedgekeurd verlof landt in
 * `medewerker_afwezigheid` (waardoor de planning meteen klopt), gaat als day-off naar Bouw7, en
 * vult daarna vanzelf de weekstaat voor.
 */
export default async function MobielVerlofPage() {
  const medewerker = await getCurrentMedewerker()
  const t = await getAppVertaler('verlof')
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

  const [aanvragen, ingepland, soorten, tvt] = await Promise.all([
    getMijnVerlof(),
    getIngeplandVerlof(medewerker.id),
    getVerlofSoorten(),
    berekenTvtSaldo(medewerker.id),
  ])

  return (
    <>
      <AppHeader title={t('titel')} sub={t('sub')} backHref="/m" />
      <MobielPullToRefresh />
      <VerlofClient
        aanvragen={aanvragen}
        ingepland={ingepland}
        soorten={soorten}
        saldo={tvt.saldo}
        tvtBeschikbaar={tvt.beschikbaar}
      />
    </>
  )
}
