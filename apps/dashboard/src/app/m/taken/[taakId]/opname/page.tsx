import { notFound, redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@everts/database/server'
import { getCurrentMedewerker } from '@/lib/auth/rechten'
import { startOpnameVoorTaak } from '@/lib/opname/opnames'

export const metadata = { title: 'Opname · EVA Mobiel' }

/**
 * Start of hervat de opname die aan deze actie hangt, en stuurt door naar het uitvoerscherm.
 *
 * Autorisatie exact zoals `/m/taken/[taakId]/kwaliteit`: de admin-client passeert de RLS op `tasks`
 * (die laat alleen platform-gebruikers door), dus de afscherming gebeurt hier zelf — je mag alleen
 * een opname openen van een actie die aan jou is toegewezen.
 */
export default async function MobielTaakOpnamePage({
  params,
}: {
  params: Promise<{ taakId: string }>
}) {
  const { taakId } = await params

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any
  const { data: taak } = await admin
    .from('tasks')
    .select('id, opname_ronde')
    .eq('id', taakId)
    .maybeSingle()
  if (!taak?.opname_ronde) notFound()

  const { data: { user } } = await (await createClient()).auth.getUser()
  if (!user) notFound()

  const [{ data: eigenToewijzing }, medewerker] = await Promise.all([
    admin.from('task_assignees').select('task_id').eq('task_id', taakId).eq('user_id', user.id).maybeSingle(),
    getCurrentMedewerker(),
  ])
  const magOpenen = !!eigenToewijzing || medewerker?.gebruiker_type === 'platform_gebruiker'
  if (!magOpenen) notFound()

  const res = await startOpnameVoorTaak(taakId)
  if (!res.ok) {
    return (
      <div style={{ padding: 24, color: 'var(--fg-muted)', fontSize: 14, lineHeight: 1.5 }}>
        De opname kon niet worden gestart: {res.error}
      </div>
    )
  }

  redirect(`/m/opname/${res.id}`)
}
