import Link from 'next/link'
import { loadBouw7Config } from './actions'
import { Bouw7Config } from './Bouw7Config'
import { PageHeader, Alert } from '@/components/ui'

export const metadata = { title: 'Integraties' }
export const dynamic = 'force-dynamic'

export default async function Page() {
  const result = await loadBouw7Config()

  return (
    <div className="eva-page">
      <Link href="/instellingen" className="eva-back-link">
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M13 4l-6 6 6 6"/>
        </svg>
        Instellingen
      </Link>

      <PageHeader eyebrow="Instellingen · Systeem" title="Integraties" />
      <p className="eva-page-desc">Koppel externe systemen aan het Everts Platform. Geïmporteerde data verschijnt in Relaties, Medewerkers en Projecten.</p>

      <section>
        <p className="eva-section-label">Exact Bouw7</p>

        {!result.ok && result.missingTable ? (
          <Alert tone="warning" title="Integraties-tabel ontbreekt">
            Draai de migratie <code style={{ fontSize: 11 }}>20260415_platform_core.draft.sql</code> in de Supabase SQL Editor.
          </Alert>
        ) : !result.ok ? (
          <Alert tone="error">{result.error}</Alert>
        ) : (
          <Bouw7Config
            existingId={result.data?.id ?? null}
            existingKey={(result.data?.config as Record<string, string>)?.api_key ?? null}
            existingAppName={(result.data?.config as Record<string, string>)?.app_name ?? null}
            laatstSync={result.data?.laatst_sync ?? null}
          />
        )}
      </section>
    </div>
  )
}
