import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getFormTemplate, getLatestFormVersie } from '../../actions'
import FormBuilder from '@/components/formulieren/builder/FormBuilder'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const result = await getFormTemplate(id)
  return { title: result.ok ? `Bewerken — ${result.data.naam}` : 'Formulier bewerken' }
}

export default async function FormulierBewerkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [templateResult, versieResult] = await Promise.all([
    getFormTemplate(id),
    getLatestFormVersie(id),
  ])

  if (!templateResult.ok) notFound()
  if (!versieResult.ok) notFound()

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <FormBuilder template={templateResult.data} versie={versieResult.data} />
    </div>
  )
}
