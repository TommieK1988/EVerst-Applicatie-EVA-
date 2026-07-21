import { createClient } from '@everts/database/server'
import { getMijnTaken } from '@/lib/taken/services/taken'
import { omschrijvingNaarTekst } from '@/lib/taken/omschrijving'
import AppHeader from '@/components/mobiel/AppHeader'
import MobielTakenLijst, { type MobielTaak } from '@/components/mobiel/MobielTakenLijst'
import MobielPullToRefresh from '@/components/mobiel/MobielPullToRefresh'

export const metadata = { title: 'Taken · EVA Mobiel' }

export default async function MobielTakenPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const taken = user ? await getMijnTaken(user.id).catch(() => []) : []

  const items: MobielTaak[] = taken.map(t => {
    const oms = omschrijvingNaarTekst(t.omschrijving).trim()
    return {
      id: t.id,
      titel: t.titel,
      deadline: t.deadline ?? null,
      prioriteit: t.prioriteit,
      dossier_naam: (t as { dossier_naam?: string | null }).dossier_naam ?? null,
      dossier_id: t.dossier_id ?? null,
      formulier_template_id: t.formulier_template_id ?? null,
      omschrijving: oms || null,
    }
  })

  return (
    <>
      <AppHeader title="Taken" sub={`${items.length} open`} backHref="/m" />
      <MobielPullToRefresh />
      <MobielTakenLijst taken={items} />
    </>
  )
}
