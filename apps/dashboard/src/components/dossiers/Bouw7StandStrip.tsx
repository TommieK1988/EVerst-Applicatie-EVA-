'use client'

import { syncTijdLabel } from '@/components/eva/SyncKnop'
import type { SnapshotTab } from '@/lib/bouw7/snapshot-soorten'

/**
 * Regeltje bovenaan een dossiertab: hoe oud de Bouw7-cijfers zijn.
 *
 * EVA haalt deze gegevens niet meer op bij het openen van een scherm — dat kostte per tab tien tot
 * veertig Bouw7-calls en maakte het hele platform traag. De cron ververst ze twee keer per dag.
 * Daardoor moet wél zichtbaar zijn wat je ziet: "Stand Bouw7: vandaag 07:02". Wie iets recenters
 * nodig heeft, gebruikt de ene Synchroniseer-knop van het dossier in de topbalk; die haalt alle
 * tabs tegelijk op. Een eigen knop per tab is er bewust niet meer.
 */
export type Bouw7StandProps = {
  dossierId: string
  tab: SnapshotTab
  opgehaaldOp: string | null
  /** Bronnen die nog nooit zijn opgehaald; niet leeg = het tab toont (nog) niets. */
  ontbreekt?: string[]
  /** Laatste mislukte ophaalpoging; de getoonde stand is dan ouder dan hij lijkt. */
  fout?: string | null
}

export function Bouw7StandStrip({ opgehaaldOp, ontbreekt = [], fout }: Bouw7StandProps) {
  const nooitOpgehaald = opgehaaldOp == null

  const tekst = nooitOpgehaald
    ? 'Nog niet opgehaald uit Bouw7 — klik Synchroniseer rechtsboven'
    : `Stand Bouw7: ${syncTijdLabel(opgehaaldOp)}`

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        padding: '4px 0 12px', fontSize: 11, color: 'var(--neutral-400)',
      }}
    >
      <span style={{ color: nooitOpgehaald ? 'var(--warning-700, #8a6d3b)' : undefined }}>{tekst}</span>

      {ontbreekt.length > 0 && !nooitOpgehaald && (
        <span title={ontbreekt.join(', ')} style={{ color: 'var(--warning-700, #8a6d3b)' }}>
          · {ontbreekt.length} onderdeel{ontbreekt.length === 1 ? '' : 'en'} nog niet opgehaald
        </span>
      )}

      {fout && (
        <span title={fout} style={{ color: 'var(--error-500)' }}>
          · ⚠ laatste poging mislukt
        </span>
      )}
    </div>
  )
}
