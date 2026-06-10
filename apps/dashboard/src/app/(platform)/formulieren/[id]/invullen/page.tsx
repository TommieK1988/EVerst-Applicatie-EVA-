import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getFormTemplate, getLatestFormVersie } from '../../actions'
import FormFiller from '@/components/formulieren/filler/FormFiller'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const result = await getFormTemplate(id)
  return { title: result.ok ? result.data.naam : 'Formulier invullen' }
}

export default async function FormulierInvullenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
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

  return (
    <div style={{ overflowY: 'auto', height: '100%' }}>
      <FormFiller template={template} versie={versieResult.data} />
    </div>
  )
}
