'use client'

import type { BtwTarief } from '@everts/database/platform-types'
import { Badge, EmptyState } from '@/components/ui'
import { nominaalPercentage } from '@/lib/stamdata/btw'

function formatDatum(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function BtwTarievenBeheer({ tarieven }: { tarieven: BtwTarief[] }) {
  const laatsteSync = tarieven
    .map(t => t.bouw7_laatst_sync)
    .filter(Boolean)
    .sort()
    .at(-1) ?? null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Badge variant="outline" tone="info" size="sm">uit Bouw7</Badge>
        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)' }}>
          Laatst bijgewerkt: {formatDatum(laatsteSync)}
        </span>
      </div>

      {tarieven.length === 0 ? (
        <EmptyState
          size="sm"
          tone="neutral"
          title="Nog geen BTW-tarieven afgeleid"
          description="Draai een Bouw7-sync of open een dossier met een offerte; de tarieven worden dan automatisch ingelezen."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {tarieven.map(t => (
            <div key={t.id} style={{
              display: 'grid', gridTemplateColumns: '70px 1fr auto', alignItems: 'center', gap: 12,
              padding: '10px 4px', borderBottom: '1px solid var(--border)',
            }}>
              <span
                style={{ fontSize: 14, fontWeight: 700, color: 'var(--fg)', fontVariantNumeric: 'tabular-nums' }}
                title={t.verlegd ? `Nominaal ${nominaalPercentage(t)}%, te heffen 0% (verlegd)` : undefined}
              >
                {nominaalPercentage(t)}%
              </span>
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg)' }}>
                {t.label}
              </span>
              {t.verlegd && (
                <Badge variant="outline" tone="warning" size="sm">verlegd</Badge>
              )}
            </div>
          ))}
        </div>
      )}

      <p style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--fg-muted)', margin: 0 }}>
        BTW-tarieven worden read-only overgenomen uit de Bouw7-offertes, zodat ze altijd
        overeenkomen met wat naar Bouw7 wordt teruggeschreven. Wijzigen kan alleen in Bouw7.
        Bij een <strong>verlegd</strong> tarief rekent de offerte 0% en komt er een vermelding
        onder het totaal dat de BTW naar de afnemer is verlegd.
      </p>
    </div>
  )
}
