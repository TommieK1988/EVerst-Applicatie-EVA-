import Link from 'next/link'
import { loadBedrijfsgegevens, createWerkmaatschappij } from './actions'
import { BedrijfsgegevensForm } from './BedrijfsgegevensForm'
import { PageHeader, Alert, Card, Input, Button } from '@/components/ui'
import type { Bedrijfsgegevens } from '@everts/database'

export const metadata = { title: 'Organisatiegegevens' }
export const dynamic = 'force-dynamic'

export default async function Page() {
  const result = await loadBedrijfsgegevens()

  return (
    <div className="eva-page">
      <Link href="/instellingen" className="eva-back-link">
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M13 4l-6 6 6 6"/>
        </svg>
        Instellingen
      </Link>

      <PageHeader eyebrow="Instellingen · Bedrijf" title="Organisatiegegevens" />
      <p className="eva-page-desc" style={{ marginTop: -10, marginBottom: 4 }}>Beheer de organisatie en werkmaatschappijen. Elke werkmaatschappij kan eigen bedrijfsgegevens en huisstijl hebben.</p>

      {!result.ok && result.missingTable ? (
        <MissingTableBanner />
      ) : !result.ok ? (
        <ErrorBanner message={result.error} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          {/* Organisatie formulier */}
          <section>
            <p className="eva-section-label">Organisatie</p>
            <BedrijfsgegevensForm initial={result.data} />
          </section>

          {/* Werkmaatschappijen */}
          {result.data && (
            <section>
              <p className="eva-section-label">Werkmaatschappijen</p>
              {result.werkmaatschappijen.length === 0 && (
                <p style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg-muted)', marginBottom: 12 }}>
                  Nog geen werkmaatschappijen. Voeg er een toe om aparte bedrijfsgegevens per entiteit te beheren.
                </p>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                {result.werkmaatschappijen.map((wm) => (
                  <WerkmaatschappijCard key={wm.id} wm={wm} />
                ))}
              </div>
              <NieuweWerkmaatschappijForm parentId={result.data.id} />
            </section>
          )}
        </div>
      )}
    </div>
  )
}

function WerkmaatschappijCard({ wm }: { wm: Bedrijfsgegevens }) {
  return (
    <Link href={`/instellingen/bedrijfsgegevens/${wm.id}`} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '14px 18px',
      background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 10,
      textDecoration: 'none',
      transition: 'background 0.15s',
    }}>
      <div>
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>{wm.naam}</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)', marginTop: 2 }}>
          {wm.code && <span style={{ marginRight: 8 }}>{wm.code}</span>}
          {wm.adres_plaats ?? 'Geen adres'}
          {wm.kvk_nummer && <> · KvK {wm.kvk_nummer}</>}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Link href={`/instellingen/bedrijfsgegevens/huisstijl?bedrijf=${wm.id}`}
          onClick={e => e.stopPropagation()}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '5px 10px',
            background: 'var(--bg-active)', border: '1px solid var(--border)', borderRadius: 6,
            fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 500, color: 'var(--fg-muted)',
            textDecoration: 'none',
          }}>
          Huisstijl
        </Link>
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--fg-muted)' }}>
          <path d="M7 4l6 6-6 6"/>
        </svg>
      </div>
    </Link>
  )
}

function NieuweWerkmaatschappijForm({ parentId }: { parentId: string }) {
  return (
    <form action={createWerkmaatschappij as unknown as (formData: FormData) => Promise<void>}>
      <input type="hidden" name="parent_id" value={parentId} />
      <Card style={{ padding: '16px 20px' }}>
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 600, color: 'var(--fg-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Nieuwe werkmaatschappij
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Input name="code" type="text" placeholder="Code (bv. EOS)" style={{ width: 110, flexShrink: 0 }} />
          <Input name="naam" type="text" required placeholder="Naam werkmaatschappij" style={{ flex: 1 }} />
          <Button type="submit" style={{ flexShrink: 0 }}>
            <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 4v12M4 10h12"/></svg>
            Toevoegen
          </Button>
        </div>
      </Card>
    </form>
  )
}

function MissingTableBanner() {
  return (
    <Alert tone="warning" title="Database-migratie nog niet uitgevoerd">
      <p style={{ margin: 0 }}>
        De tabel <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, background: 'rgba(0,0,0,0.06)', padding: '1px 5px', borderRadius: 4 }}>bedrijfsgegevens</code> bestaat nog niet.
      </p>
      <ol style={{ paddingLeft: 18, marginTop: 8, marginBottom: 0, lineHeight: 1.8 }}>
        <li>Draai <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>20260415_platform_core.draft.sql</code></li>
        <li>Draai <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>20260416_huisstijl_uitbreiding.sql</code></li>
        <li>Herlaad deze pagina</li>
      </ol>
    </Alert>
  )
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <Alert tone="error">{message}</Alert>
  )
}
