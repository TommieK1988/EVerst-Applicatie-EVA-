import type { Metadata } from 'next'
import Link from 'next/link'
import { getFormTemplates } from '../actions'
import type { FormTemplate } from '@/components/formulieren/types'
import { TEMPLATE_CATEGORIE_LABELS } from '@/components/formulieren/types'
import { format } from 'date-fns'
import { nl } from 'date-fns/locale'

export const metadata: Metadata = { title: 'Formulieren — Sjablonen' }

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  concept:       { bg: '#fef9c3', color: '#854d0e', label: 'Concept' },
  gepubliceerd:  { bg: '#dcfce7', color: '#16a34a', label: 'Gepubliceerd' },
  gearchiveerd:  { bg: '#f3f4f6', color: '#6b7280', label: 'Gearchiveerd' },
}

function TemplateKaart({ t }: { t: FormTemplate }) {
  const s = STATUS_STYLE[t.status] ?? STATUS_STYLE.concept
  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: 10,
      padding: '18px 20px',
      background: 'var(--surface)',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      transition: 'box-shadow 0.15s, border-color 0.15s',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>
            {t.naam}
          </h3>
          {t.omschrijving && (
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {t.omschrijving}
            </p>
          )}
        </div>
        <span style={{
          fontSize: 11, fontWeight: 600,
          padding: '2px 8px', borderRadius: 10, flexShrink: 0,
          background: s.bg, color: s.color,
        }}>
          {s.label}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
        {t.categorie && (
          <span style={{
            fontSize: 11, padding: '1px 6px', borderRadius: 8,
            background: 'var(--surface-2)', color: 'var(--text-muted)',
          }}>
            {TEMPLATE_CATEGORIE_LABELS[t.categorie] ?? t.categorie}
          </span>
        )}
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          v{t.huidige_versie}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
          {format(new Date(t.bijgewerkt_op), 'd MMM yyyy', { locale: nl })}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
        <Link
          href={`/formulieren/${t.id}/bewerken`}
          style={{
            flex: 1, textAlign: 'center',
            padding: '7px 12px', borderRadius: 7,
            border: '1px solid var(--border)',
            background: 'var(--bg)', color: 'var(--text)',
            fontSize: 12, fontWeight: 500, textDecoration: 'none',
          }}
        >
          Bewerken
        </Link>
        {t.status === 'gepubliceerd' && (
          <Link
            href={`/formulieren/${t.id}/invullen`}
            style={{
              flex: 1, textAlign: 'center',
              padding: '7px 12px', borderRadius: 7,
              border: 'none',
              background: '#009439', color: 'white',
              fontSize: 12, fontWeight: 600, textDecoration: 'none',
            }}
          >
            Invullen
          </Link>
        )}
        <Link
          href={`/formulieren/${t.id}/inzendingen`}
          style={{
            padding: '7px 12px', borderRadius: 7,
            border: '1px solid var(--border)',
            background: 'var(--bg)', color: 'var(--text-muted)',
            fontSize: 12, textDecoration: 'none',
          }}
        >
          Inzendingen
        </Link>
      </div>
    </div>
  )
}

export default async function FormulierenSjablonenPage() {
  const result = await getFormTemplates()
  const templates = result.ok ? result.data : []

  const actief       = templates.filter(t => t.status !== 'gearchiveerd')
  const gearchiveerd = templates.filter(t => t.status === 'gearchiveerd')

  return (
    <div style={{ padding: '32px', maxWidth: 1100, width: '100%', boxSizing: 'border-box' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 32,
      }}>
        <div>
          <h1 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 700, color: 'var(--text)' }}>
            Formuliersjablonen
          </h1>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--text-muted)' }}>
            Beheer digitale werkbonnen, inspecties, opleveringen en checklists.
          </p>
        </div>
        <Link
          href="/formulieren/nieuw"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '10px 20px', borderRadius: 8,
            border: 'none',
            background: '#009439', color: 'white',
            fontSize: 14, fontWeight: 700, textDecoration: 'none',
            boxShadow: '0 2px 6px rgba(0,148,57,0.35)',
            flexShrink: 0,
          }}
        >
          <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path d="M12 5v14M5 12h14"/>
          </svg>
          Nieuw formulier
        </Link>
      </div>

      {actief.length === 0 ? (
        <div style={{
          padding: '64px 32px',
          textAlign: 'center',
          border: '1px dashed var(--border)',
          borderRadius: 12,
          color: 'var(--text-muted)',
        }}>
          <svg width={48} height={48} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1} style={{ margin: '0 auto 16px', display: 'block', opacity: 0.4 }}>
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
          </svg>
          <p style={{ fontSize: 16, fontWeight: 500, marginBottom: 6 }}>Nog geen formulieren</p>
          <p style={{ fontSize: 13 }}>Maak je eerste formulier aan om werkbonnen, inspecties en checklists te digitaliseren.</p>
          <Link
            href="/formulieren/nieuw"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              marginTop: 20,
              padding: '10px 22px', borderRadius: 8,
              background: '#009439', color: 'white',
              fontSize: 14, fontWeight: 700, textDecoration: 'none',
              boxShadow: '0 2px 6px rgba(0,148,57,0.35)',
            }}
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path d="M12 5v14M5 12h14"/>
            </svg>
            Eerste formulier aanmaken
          </Link>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: 16,
        }}>
          {actief.map(t => <TemplateKaart key={t.id} t={t} />)}
        </div>
      )}

      {gearchiveerd.length > 0 && (
        <div style={{ marginTop: 40 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 12 }}>
            Gearchiveerd ({gearchiveerd.length})
          </h2>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 16,
            opacity: 0.6,
          }}>
            {gearchiveerd.map(t => <TemplateKaart key={t.id} t={t} />)}
          </div>
        </div>
      )}

      {!result.ok && (
        <div style={{ marginTop: 16, padding: '12px 16px', borderRadius: 8, background: '#fee2e2', color: '#dc2626', fontSize: 13 }}>
          Fout bij laden formulieren: {result.error}
        </div>
      )}
    </div>
  )
}
