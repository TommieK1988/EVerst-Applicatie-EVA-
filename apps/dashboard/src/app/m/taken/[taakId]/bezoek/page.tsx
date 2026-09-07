import { notFound, redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@everts/database/server'
import { getCurrentMedewerker } from '@/lib/auth/rechten'
import { startBezoekVoorTaak } from '@/lib/bezoek/bezoeken'

export const metadata = { title: 'Projectbezoek · EVA Mobiel' }

/**
 * Start of hervat het projectbezoek dat aan deze actie hangt, en stuurt door naar de doorloop.
 *
 * Autorisatie exact zoals `/m/taken/[taakId]/kwaliteit`: de admin-client passeert de RLS op
 * `tasks` (die laat alleen platform-gebruikers door), dus de afscherming gebeurt hier zelf — je
 * mag alleen een bezoek openen van een actie die aan jou is toegewezen.
 */
export default async function MobielTaakBezoekPage({
  params,
}: {
  params: Promise<{ taakId: string }>
}) {
  const { taakId } = await params

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any
  const { data: taak } = await admin
    .from('tasks')
    .select('id, bezoek_ronde')
    .eq('id', taakId)
    .maybeSingle()
  if (!taak?.bezoek_ronde) notFound()

  const { data: { user } } = await (await createClient()).auth.getUser()
  if (!user) notFound()

  const [{ data: eigenToewijzing }, medewerker] = await Promise.all([
    admin.from('task_assignees').select('task_id').eq('task_id', taakId).eq('user_id', user.id).maybeSingle(),
    getCurrentMedewerker(),
  ])
  const magOpenen = !!eigenToewijzing || medewerker?.gebruiker_type === 'platform_gebruiker'
  if (!magOpenen) notFound()

  const res = await startBezoekVoorTaak(taakId)
  if (!res.ok) {
    return (
      <div style={{ padding: 24, color: 'var(--fg-muted)', fontSize: 14, lineHeight: 1.5 }}>
        Het projectbezoek kon niet worden gestart: {res.error}
      </div>
    )
  }

  redirect(`/m/bezoek/${res.id}`)
}
