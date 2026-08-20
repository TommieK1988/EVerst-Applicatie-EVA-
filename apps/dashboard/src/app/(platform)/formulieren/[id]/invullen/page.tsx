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
import { resolveDossierVariabelen } from '@/components/formulieren/dossier-variabelen'
import { getDossierById } from '@/lib/dossiers/actions'
import { createAdminClient } from '@everts/database/server'
import { getMedewerkersVoorToewijzing } from '@/app/(platform)/taken/actions/sjablonen'

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
  const { task_id: taskId, dossier_id: urlDossierId, inzending_id: inzendingId, new: nieuwNonce } = await searchParams
  const [templateResult, versieResult] = await Promise.all([
    getFormTemplate(id),
    getLatestFormVersie(id),
  ])

  // Vullen we in vanuit een taak zonder dossier in de URL, dan halen we het
  // dossier van de taak zelf op — of van de actielijst waar hij onder hangt.
  // Taken uit een actielijst-sjabloon hebben zelf geen `dossier_id`; zonder deze
  // terugval bleef de inzending dossierloos en viel hij buiten het VCA-tab.
  const dossierId = urlDossierId ?? (taskId ? await dossierVanTaak(taskId) : undefined)

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

  // Medewerkers voor `medewerker`-velden + dossier-gegevens voor `dossier`-velden.
  // Het effectieve dossier kan uit de URL komen of (bij hervatten) uit de inzending.
  const effectiveDossierId = dossierId ?? bestaande?.dossier_id ?? undefined
  const [medewerkers, dossierWaarden] = await Promise.all([
    getMedewerkersVoorToewijzing().then(list => list.map(m => ({ id: m.id, naam: m.naam }))),
    effectiveDossierId
      ? getDossierById(effectiveDossierId).then(res =>
          res.ok ? resolveDossierVariabelen(versieResult.data.schema.fields ?? [], res.data) : undefined,
        )
      : Promise.resolve(undefined),
  ])

  return (
    <div style={{ overflowY: 'auto', height: '100%' }}>
      <FormFiller
        template={template}
        versie={versieResult.data}
        taskId={taskId}
        dossierId={effectiveDossierId}
        draftScope={draftScope}
        bestaandeInzending={bestaande}
        medewerkers={medewerkers}
        dossierWaarden={dossierWaarden}
      />
    </div>
  )
}

/** Dossier van een taak: eigen koppeling vóór die van de actielijst. */
async function dossierVanTaak(taskId: string): Promise<string | undefined> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('tasks')
    .select('dossier_id, task_lists(dossier_id)')
    .eq('id', taskId)
    .maybeSingle()
  const rij = data as unknown as {
    dossier_id: string | null
    task_lists: { dossier_id: string | null } | null
  } | null
  return rij?.dossier_id ?? rij?.task_lists?.dossier_id ?? undefined
}
