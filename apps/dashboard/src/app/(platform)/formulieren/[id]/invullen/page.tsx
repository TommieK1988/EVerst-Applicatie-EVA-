import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import {
  getFormTemplate,
  getLatestFormVersie,
  getConceptInzendingVoorTaak,
  getConceptInzendingenVoorDossier,
  getFormInzending,
} from '../../actions'
import FormFiller from '@/components/formulieren/filler/FormFiller'
import ConceptKeuze from '@/components/formulieren/filler/ConceptKeuze'
import type { FormInzending } from '@/components/formulieren/types'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const result = await getFormTemplate(id)
  return { title: result.ok ? result.data.naam : 'Formulier invullen' }
}

export default async function FormulierInvullenPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ task_id?: string; dossier_id?: string; inzending_id?: string; new?: string }>
}) {
  const { id } = await params
  const { task_id: taskId, dossier_id: dossierId, inzending_id: inzendingId, new: nieuwNonce } = await searchParams
  const [templateResult, versieResult] = await Promise.all([
    getFormTemplate(id),
    getLatestFormVersie(id),
  ])

  if (!templateResult.ok) notFound()
  if (!versieResult.ok) notFound()

  const template = templateResult.data
  if (template.status !== 'gepubliceerd') {
    return (
      <div style={{ padding: 32, color: 'var(--text-muted)', fontSize: 14 }}>
        Dit formulier is nog niet gepubliceerd en kan niet ingevuld worden.
      </div>
    )
  }

  // Welk bestaand concept hervatten we, en onder welke cache-scope?
  // 1) Expliciet gekozen concept (uit het keuzescherm of de task-flow).
  // 2) Bestaand concept voor deze taak (voorkomt dubbele inzendingen per taak).
  // 3) Dossier zonder expliciete keuze én met bestaande concepten → keuzescherm.
  let bestaande: FormInzending | undefined = undefined
  let draftScope: string | undefined

  if (inzendingId) {
    const res = await getFormInzending(inzendingId)
    bestaande = res.ok ? res.data : undefined
    draftScope = inzendingId
  } else if (taskId) {
    const res = await getConceptInzendingVoorTaak(taskId)
    bestaande = res.ok ? (res.data ?? undefined) : undefined
    draftScope = bestaande?.id ?? `taak:${taskId}`
  } else if (dossierId && !nieuwNonce) {
    const res = await getConceptInzendingenVoorDossier(id, dossierId)
    const concepten = res.ok ? res.data : []
    if (concepten.length > 0) {
      return (
        <div style={{ overflowY: 'auto', height: '100%' }}>
          <ConceptKeuze
            templateId={id}
            templateNaam={template.naam}
            dossierId={dossierId}
            concepten={concepten}
          />
        </div>
      )
    }
    draftScope = `dossier:${dossierId}`
  } else if (nieuwNonce) {
    draftScope = `new:${nieuwNonce}`
  }

  return (
    <div style={{ overflowY: 'auto', height: '100%' }}>
      <FormFiller
        template={template}
        versie={versieResult.data}
        taskId={taskId}
        dossierId={dossierId}
        draftScope={draftScope}
        bestaandeInzending={bestaande}
      />
    </div>
  )
}
