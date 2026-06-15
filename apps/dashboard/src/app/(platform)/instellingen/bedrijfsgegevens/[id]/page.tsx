import Link from 'next/link'
import { Alert, Button } from '@/components/ui'
import { loadBedrijfById } from '../actions'
import { BedrijfsgegevensForm } from '../BedrijfsgegevensForm'

export const dynamic = 'force-dynamic'

export async function generateMetadata(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const result = await loadBedrijfById(params.id)
  return { title: result.ok ? result.data.naam : 'Werkmaatschappij' }
}

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const result = await loadBedrijfById(params.id)

  return (
    <div className="eva-page">
      <Link href="/instellingen/bedrijfsgegevens" className="eva-back-link">
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M13 4l-6 6 6 6"/>
        </svg>
        Organisatiegegevens
      </Link>

      {!result.ok ? (
        <Alert tone="error">{result.error}</Alert>
      ) : (
        <>
          <div className="eva-page-header">
            <p className="eva-page-kicker">
              Werkmaatschappij{result.data.code && <> · <span style={{  }}>{result.data.code}</span></>}
            </p>
            <h1 className="eva-page-title">{result.data.naam}</h1>
            <p className="eva-page-desc">
              Lege velden worden automatisch overgenomen van{' '}
              <strong style={{ fontWeight: 600 }}>{result.parent?.naam ?? 'de organisatie'}</strong>.
            </p>
            <Button asChild variant="ghost" size="sm" className="mt-3">
              <Link href={`/instellingen/bedrijfsgegevens/huisstijl?bedrijf=${params.id}`}>
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="10" cy="10" r="3.5"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.5 4.5l1.4 1.4M14.1 14.1l1.4 1.4M4.5 15.5l1.4-1.4M14.1 5.9l1.4-1.4"/>
                </svg>
                Huisstijl bewerken
              </Link>
            </Button>
          </div>

          <BedrijfsgegevensForm initial={result.data} parent={result.parent} />
        </>
      )}
    </div>
  )
}
