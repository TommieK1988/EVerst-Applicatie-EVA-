'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { syncTijdLabel } from '@/components/eva/SyncKnop'
import { vernieuwDossierSnapshots } from '@/lib/bouw7/snapshot-actions'
import { SOORTEN_PER_TAB, type SnapshotTab } from '@/lib/bouw7/snapshot-soorten'

/**
 * Regeltje bovenaan een dossiertab: hoe oud de Bouw7-cijfers zijn, met een knop om ze nu op te
 * halen.
 *
 * EVA haalt deze gegevens niet meer op bij het openen van een scherm — dat kostte per tab tien tot
 * veertig Bouw7-calls en maakte het hele platform traag. De cron ververst ze twee keer per dag.
 * Daardoor moet wél zichtbaar zijn wat je ziet: "Stand Bouw7: vandaag 07:02". Wie iets recenters
 * nodig heeft, klikt Vernieuwen en haalt precies de bronnen van dít tab op.
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

export function Bouw7StandStrip({ dossierId, tab, opgehaaldOp, ontbreekt = [], fout }: Bouw7StandProps) {
  const router = useRouter()
  const [bezig, startTransition] = useTransition()
  const [melding, setMelding] = useState<string | null>(null)
  const [laden, setLaden] = useState(false)

  const nooitOpgehaald = opgehaaldOp == null

  async function vernieuw() {
    if (laden || bezig) return
    setLaden(true)
    setMelding(null)
    try {
      const r = await vernieuwDossierSnapshots(dossierId, [...SOORTEN_PER_TAB[tab]])
      if (r.fouten.length > 0) setMelding(r.fouten[0])
      startTransition(() => router.refresh())
    } catch (e) {
      setMelding(e instanceof Error ? e.message : 'Vernieuwen mislukt')
    } finally {
      setLaden(false)
    }
  }

  const tekst = nooitOpgehaald
    ? 'Nog niet opgehaald uit Bouw7'
    : `Stand Bouw7: ${syncTijdLabel(opgehaaldOp)}`

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        padding: '6px 0 10px', fontSize: 11, color: 'var(--neutral-400)',
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

      {melding && (
        <span title={melding} style={{ color: 'var(--error-500)', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          · {melding}
        </span>
      )}

      <Button
        variant={nooitOpgehaald ? 'primary' : 'secondary'}
        size="sm"
        loading={laden || bezig}
        onClick={vernieuw}
      >
        {laden || bezig ? 'Ophalen…' : 'Vernieuwen'}
      </Button>
    </div>
  )
}
