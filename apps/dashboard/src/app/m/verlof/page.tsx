import { createAdminClient } from '@everts/database/server'
import { getCurrentMedewerker } from '@/lib/auth/rechten'
import AppHeader from '@/components/mobiel/AppHeader'
import MobielPullToRefresh from '@/components/mobiel/MobielPullToRefresh'
import VerlofClient from '@/components/mobiel/uren/VerlofClient'
import { getMijnVerlof, getVerlofSoorten } from '@/lib/uren/verlof'

export const metadata = { title: 'Verlof · EVA Mobiel' }
export const dynamic = 'force-dynamic'

/**
 * Verlof aanvragen en je eigen aanvragen volgen. Goedgekeurd verlof landt in
 * `medewerker_afwezigheid` (waardoor de planning meteen klopt), gaat als day-off naar Bouw7, en
 * vult daarna vanzelf de weekstaat voor.
 */
export default async function MobielVerlofPage() {
  const medewerker = await getCurrentMedewerker()
  if (!medewerker) {
    return (
      <>
        <AppHeader title="Verlof" backHref="/m" />
        <div style={{ textAlign: 'center', color: '#6b757c', padding: '48px 16px', fontSize: 14 }}>
          Geen medewerker-koppeling gevonden voor dit account.
        </div>
      </>
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const [aanvragen, soorten, { data: saldoRij }] = await Promise.all([
    getMijnVerlof(),
    getVerlofSoorten(),
    supabase.from('uren_saldo_per_medewerker')
      .select('saldo_uren').eq('medewerker_id', medewerker.id).maybeSingle(),
  ])

  return (
    <>
      <AppHeader title="Verlof" sub="Aanvragen en saldo" backHref="/m" />
      <MobielPullToRefresh />
      <VerlofClient
        aanvragen={aanvragen}
        soorten={soorten}
        saldo={Number(saldoRij?.saldo_uren ?? 0)}
      />
    </>
  )
}
