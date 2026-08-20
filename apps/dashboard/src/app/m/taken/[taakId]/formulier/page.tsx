import { notFound } from 'next/navigation'
import { createClient, createAdminClient } from '@everts/database/server'
import { getCurrentMedewerker } from '@/lib/auth/rechten'
import {
  getFormTemplate,
  getLatestFormVersie,
  getConceptInzendingVoorTaak,
} from '@/app/(platform)/formulieren/actions'
import FormFiller from '@/components/formulieren/filler/FormFiller'
import { resolveDossierVariabelen } from '@/components/formulieren/dossier-variabelen'
import { getDossierById } from '@/lib/dossiers/actions'
import { getMedewerkersVoorToewijzing } from '@/app/(platform)/taken/actions/sjablonen'

export const metadata = { title: 'Formulier · EVA Mobiel' }

export default async function MobielTaakFormulierPage({
  params,
}: {
  params: Promise<{ taakId: string }>
}) {
  const { taakId } = await params

  // Admin-client: de RLS op `tasks` laat alleen platform_gebruikers door, dus een
  // app_gebruiker (monteur) kreeg hier niets terug en belandde op notFound().
  // Omdat de admin-client de RLS passeert, doen we de afscherming zelf hieronder:
  // je mag alleen een formulier openen van een taak die aan jou is toegewezen.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any
  const { data: taak } = await admin
    .from('tasks')
    .select('id, titel, formulier_template_id, dossier_id, task_lists(dossier_id)')
    .eq('id', taakId)
    .maybeSingle()

  if (!taak?.formulier_template_id) notFound()

  const { data: { user } } = await (await createClient()).auth.getUser()
  if (!user) notFound()

  const [{ data: eigenToewijzing }, medewerker] = await Promise.all([
    admin
      .from('task_assignees')
      .select('task_id')
      .eq('task_id', taakId)
      .eq('user_id', user.id)
      .maybeSingle(),
    getCurrentMedewerker(),
  ])

  // Platform-gebruikers hielden onder de oude RLS toegang tot elke taak; die
  // ruimte laten we staan zodat er niets omvalt op de desktop-kant.
  const magOpenen = !!eigenToewijzing || medewerker?.gebruiker_type === 'platform_gebruiker'
  if (!magOpenen) notFound()

  // Dossier-koppeling: directe taak-koppeling vóór de koppeling via de lijst.
  const dossierId: string | null =
    taak.dossier_id ?? taak.task_lists?.dossier_id ?? null

  const [templateResult, versieResult, bestaande] = await Promise.all([
    getFormTemplate(taak.formulier_template_id),
    getLatestFormVersie(taak.formulier_template_id),
    getConceptInzendingVoorTaak(taakId),
  ])

  if (!templateResult.ok || !versieResult.ok) notFound()

  const template = templateResult.data
  if (template.status !== 'gepubliceerd') {
    return (
      <div style={{ padding: 24, color: '#6b757c', fontSize: 14 }}>
        Dit formulier is nog niet gepubliceerd en kan niet ingevuld worden.
      </div>
    )
  }

  // Medewerkers voor `medewerker`-velden + dossier-gegevens voor `dossier`-velden.
  const [medewerkers, dossierWaarden] = await Promise.all([
    getMedewerkersVoorToewijzing().then(list => list.map(m => ({ id: m.id, naam: m.naam }))),
    dossierId
      ? getDossierById(dossierId).then(res =>
          res.ok ? resolveDossierVariabelen(versieResult.data.schema.fields ?? [], res.data) : undefined,
        )
      : Promise.resolve(undefined),
  ])

  return (
    <FormFiller
      template={template}
      versie={versieResult.data}
      taskId={taak.id}
      dossierId={dossierId ?? undefined}
      bestaandeInzending={bestaande.ok ? (bestaande.data ?? undefined) : undefined}
      medewerkers={medewerkers}
      dossierWaarden={dossierWaarden}
      mobiel
      terugHref="/m/taken"
    />
  )
}
