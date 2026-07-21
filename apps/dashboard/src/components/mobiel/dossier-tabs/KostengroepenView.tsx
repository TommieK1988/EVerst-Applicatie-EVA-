import React from 'react'
import { getDossierBewaking } from '@/lib/dossiers/actions'

/**
 * Mobiele Kostengroepen-tab: bewakingscodes met ARBEID, per hoofdstuk. Bewust
 * arbeid-/urengericht voor de buitendienst — prognose-uren, geboekte uren en
 * % gereed, GEEN euro-bedragen (te bevestigen met Tom of bedragen wél mogen).
 * Zware live-Bouw7-call → in `<Suspense>` gewikkeld door de pagina.
 */
export default async function KostengroepenView({ dossierId }: { dossierId: string }) {
  const data = await getDossierBewaking(dossierId).catch(() => null)

  if (!data || !data.beschikbaar) {
    return (
      <div style={{ textAlign: 'center', color: '#6b757c', padding: '40px 16px', fontSize: 14 }}>
        Geen bewakingsgegevens beschikbaar voor dit dossier.
      </div>
    )
  }

  const pct = (v: number | null) => (v == null ? '—' : `${Math.round(v * 100)}%`)
  const uren = (v: number) => (v ? v.toLocaleString('nl-NL', { maximumFractionDigits: 1 }) : '0')

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {data.projectProgress != null && (
        <div style={{
          padding: '12px 14px', background: '#fff', border: '1px solid #e3e8ea',
          borderRadius: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#161b20' }}>Project gereed</span>
          <span style={{ fontSize: 15, fontWeight: 800, color: '#009439' }}>{pct(data.projectProgress)}</span>
        </div>
      )}

      {data.hoofdstukken.map((h, hi) => {
        // Alleen regels met arbeid (prognose- of geboekte uren) zijn relevant voor de buitendienst.
        const regels = h.regels.filter(r => (r.prognoseUren ?? 0) > 0 || (r.geboekteUren ?? 0) > 0)
        if (regels.length === 0) return null

        return (
          <div key={`${h.id ?? 'x'}-${hi}`}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6b757c', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              {h.naam}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {regels.map((r, ri) => (
                <div key={`${r.code ?? ri}`} style={{
                  padding: '12px 14px', background: '#fff',
                  border: '1px solid #e3e8ea', borderRadius: 12,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#161b20', minWidth: 0 }}>
                      {r.code ? `${r.code} · ` : ''}{r.naam ?? '—'}
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 800, color: '#009439', flexShrink: 0 }}>
                      {pct(r.progress)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#6b757c' }}>
                    <span>Prognose: <strong style={{ color: '#161b20' }}>{uren(r.prognoseUren)}u</strong></span>
                    <span>Geboekt: <strong style={{ color: '#161b20' }}>{uren(r.geboekteUren)}u</strong></span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
