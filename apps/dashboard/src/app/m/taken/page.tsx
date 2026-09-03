import { createClient, createAdminClient } from '@everts/database/server'
import { getMijnTaken } from '@/lib/taken/services/taken'
import { omschrijvingNaarTekst } from '@/lib/taken/omschrijving'
import AppHeader from '@/components/mobiel/AppHeader'
import MobielTakenLijst, { type MobielTaak } from '@/components/mobiel/MobielTakenLijst'
import MobielPullToRefresh from '@/components/mobiel/MobielPullToRefresh'
import MobielNieuweActie from '@/components/mobiel/MobielNieuweActie'

export const metadata = { title: 'Acties · EVA Mobiel' }

export default async function MobielTakenPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const taken = user ? await getMijnTaken(user.id).catch(() => []) : []

  // Toolbox-taken herkennen: koppel task_id → openstaande toewijzing zodat de
  // taak naar de doorloop linkt i.p.v. een gewoon afvinkje.
  const taskIds = taken.map(t => t.id)
  const toolboxPerTask = new Map<string, string>()
  if (taskIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any
    const { data: toew } = await admin
      .from('toolbox_toewijzingen')
      .select('id, task_id')
      .in('task_id', taskIds)
      .neq('status', 'afgerond')
    for (const r of (toew ?? []) as { id: string; task_id: string | null }[]) {
      if (r.task_id) toolboxPerTask.set(r.task_id, r.id)
    }
  }

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
      kwaliteit_ronde: t.kwaliteit_ronde ?? false,
      opname_ronde: t.opname_ronde ?? false,
      toolbox_toewijzing_id: toolboxPerTask.get(t.id) ?? null,
      omschrijving: oms || null,
    }
  })

  return (
    <>
      <AppHeader title="Acties" sub={`${items.length} open`} backHref="/m" />
      <MobielPullToRefresh />
      <MobielTakenLijst taken={items} />
      {user && <MobielNieuweActie userId={user.id} />}
    </>
  )
}
