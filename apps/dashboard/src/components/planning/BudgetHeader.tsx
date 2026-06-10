'use client'

import type { PlanningWerkbegrotingRegelMetUursoort } from '@everts/database/platform-types'

type BudgetRij = PlanningWerkbegrotingRegelMetUursoort & {
  geplande_uren: number
}

export default function BudgetHeader({ regels }: { regels: BudgetRij[] }) {
  if (regels.length === 0) return null

  return (
    <div style={{
      display: 'flex', gap: 16, flexWrap: 'wrap',
      padding: '10px 14px',
      background: 'var(--bg-elev)',
      border: '1px solid var(--border)',
      borderRadius: 8,
    }}>
      {regels.map(r => {
        const pct = r.begrote_uren > 0 ? Math.min(100, (r.geplande_uren / r.begrote_uren) * 100) : 0
        const kleur = pct >= 100 ? '#c0392b' : pct >= 80 ? '#e08a1e' : r.planning_uursoorten?.kleur ?? 'var(--accent)'
        const restant = Math.max(0, r.begrote_uren - r.geplande_uren)

        return (
          <div key={r.id} style={{ minWidth: 140 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600, color: 'var(--fg)' }}>
                {r.planning_uursoorten?.naam ?? '—'}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-muted)' }}>
                {r.geplande_uren.toFixed(1)}u / {r.begrote_uren.toFixed(1)}u
              </span>
            </div>
            <div style={{ height: 6, background: 'var(--bg-active)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: kleur, borderRadius: 3, transition: 'width 0.3s' }} />
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-muted)', marginTop: 2 }}>
              {restant > 0 ? `${restant.toFixed(1)}u beschikbaar` : 'Vol'}
            </div>
          </div>
        )
      })}
    </div>
  )
}
