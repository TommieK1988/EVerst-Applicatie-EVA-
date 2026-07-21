import type { Metadata } from 'next'
import Link from 'next/link'
import { getKamInzendingen, getKamStats, getKamTemplates } from '../actions'
import { KamTabelClient } from '../KamTabelClient'

export const metadata: Metadata = { title: 'KAM / VGM — Formulieren' }

export default async function KamFormulierenPage() {
  const [inzendingenResult, stats, templates] = await Promise.all([
    getKamInzendingen(),
    getKamStats(),
    getKamTemplates(),
  ])

  const inzendingen = inzendingenResult.ok ? inzendingenResult.data : []

  return (
    <div style={{ padding: '32px', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: '0 0 6px', fontSize: 24, fontWeight: 700, color: 'var(--text)' }}>
          KAM / VGM — Formulieren
        </h1>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--text-muted)' }}>
          Alle formulieren die als KAM/VGM-formulier zijn gemarkeerd, met hun inzendingen —
          inspecties, VCA-registraties en meldingen.
        </p>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 14, marginBottom: 28,
      }}>
        <StatKaart label="Ingediend dit jaar" waarde={stats.totaal_dit_jaar} kleur="#009439" />
        <StatKaart label="Wacht op verwerking" waarde={stats.open_inspecties} kleur="#f59e0b" />
        <StatKaart label="KAM-formulieren" waarde={templates.length} kleur="#3b82f6" />
      </div>

      {templates.length === 0 ? (
        <div style={{
          padding: '48px 32px', textAlign: 'center',
          border: '1px dashed var(--border)', borderRadius: 12,
          color: 'var(--text-muted)',
        }}>
          <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.4 }}>🛡</div>
          <p style={{ fontSize: 15, fontWeight: 500, marginBottom: 8 }}>Nog geen KAM-formulieren</p>
          <p style={{ fontSize: 13, marginBottom: 20 }}>
            Zet bij een formulier het vinkje &quot;KAM/VGM-formulier&quot; aan in de form builder.
          </p>
          <Link
            href="/formulieren"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '9px 18px', borderRadius: 8,
              background: '#009439', color: 'white',
              fontSize: 13, fontWeight: 600, textDecoration: 'none',
            }}
          >
            Formulieren beheren →
          </Link>
        </div>
      ) : (
        <KamTabelClient inzendingen={inzendingen} templates={templates} />
      )}

      {!inzendingenResult.ok && (
        <div style={{ marginTop: 16, padding: '12px 16px', borderRadius: 8, background: '#fee2e2', color: '#dc2626', fontSize: 13 }}>
          Fout bij laden: {inzendingenResult.error}
        </div>
      )}
    </div>
  )
}

function StatKaart({ label, waarde, kleur }: { label: string; waarde: number; kleur: string }) {
  return (
    <div style={{
      padding: '18px 20px', borderRadius: 10,
      border: '1px solid var(--border)', background: 'var(--surface)',
    }}>
      <div style={{ fontSize: 28, fontWeight: 800, color: kleur, lineHeight: 1 }}>{waarde}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{label}</div>
    </div>
  )
}
