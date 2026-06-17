import { notFound } from 'next/navigation'
import { createClient } from '@everts/database/server'
import {
  getFormTemplate,
  getLatestFormVersie,
  getConceptInzendingVoorTaak,
} from '@/app/(platform)/formulieren/actions'
import FormFiller from '@/components/formulieren/filler/FormFiller'

export const metadata = { title: 'Formulier · EVA Mobiel' }

export default async function MobielTaakFormulierPage({
  params,
}: {
  params: Promise<{ taakId: string }>
}) {
  const { taakId } = await params

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any
  const { data: taak } = await supabase
    .from('tasks')
    .select('id, titel, formulier_template_id, dossier_id, task_lists(dossier_id)')
    .eq('id', taakId)
    .maybeSingle()

  if (!taak?.formulier_template_id) notFound()

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

  return (
    <FormFiller
      template={template}
      versie={versieResult.data}
      taskId={taak.id}
      dossierId={dossierId ?? undefined}
      bestaandeInzending={bestaande.ok ? (bestaande.data ?? undefined) : undefined}
      mobiel
      terugHref="/m/taken"
    />
  )
}
