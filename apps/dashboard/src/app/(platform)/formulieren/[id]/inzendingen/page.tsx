import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getFormTemplate, getFormInzendingen } from '../../actions'
import SubmissionsTable from '@/components/formulieren/submissions/SubmissionsTable'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const result = await getFormTemplate(id)
  return { title: result.ok ? `Inzendingen — ${result.data.naam}` : 'Inzendingen' }
}

export default async function InzendingenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [templateResult, inzendingenResult] = await Promise.all([
    getFormTemplate(id),
    getFormInzendingen(id),
  ])

  if (!templateResult.ok) notFound()

  const template = templateResult.data
  const inzendingen = inzendingenResult.ok ? inzendingenResult.data : []

  return (
    <div style={{ padding: '32px', maxWidth: 1000 }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Link
            href="/formulieren/sjablonen"
            style={{ fontSize: 13, color: 'var(--text-muted)', textDecoration: 'none' }}
          >
            Formulieren
          </Link>
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ color: 'var(--text-muted)' }}>
            <path d="M9 18l6-6-6-6"/>
          </svg>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{template.naam}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>
            Inzendingen
          </h1>
          <div style={{ display: 'flex', gap: 10 }}>
            <Link
              href={`/formulieren/${id}/bewerken`}
              style={{
                padding: '8px 14px', borderRadius: 7,
                border: '1px solid var(--border)',
                background: 'var(--surface)', color: 'var(--text)',
                fontSize: 13, textDecoration: 'none',
              }}
            >
              Bewerken
            </Link>
            {template.status === 'gepubliceerd' && (
              <Link
                href={`/formulieren/${id}/invullen`}
                style={{
                  padding: '8px 14px', borderRadius: 7,
                  border: 'none',
                  background: 'var(--primary, #3b82f6)', color: 'white',
                  fontSize: 13, fontWeight: 600, textDecoration: 'none',
                }}
              >
                Invullen
              </Link>
            )}
          </div>
        </div>
      </div>

      {!inzendingenResult.ok && (
        <div style={{ padding: '12px 16px', borderRadius: 8, background: '#fee2e2', color: '#dc2626', fontSize: 13, marginBottom: 16 }}>
          Fout bij laden inzendingen: {inzendingenResult.error}
        </div>
      )}

      <SubmissionsTable templateId={id} inzendingen={inzendingen} />
    </div>
  )
}
