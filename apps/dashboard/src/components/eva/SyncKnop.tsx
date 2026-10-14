'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { syncTijdLabel } from '@/lib/sync-tijd'

/**
 * Uniforme sync-knop (EVA-standaard, overgenomen van het Management-scherm).
 *
 * Opbouw is overal gelijk: links het tijdstip van de laatste sync
 * ("Sync: Vandaag 14:32" / "Gisteren…" / "Eergisteren…" / "28-06-2026 08:00"),
 * daarnaast een eventuele resultaatmelding, rechts de primary knop "Synchroniseer".
 *
 * `onSync` is de pagina-specifieke handler (server-action-aanroep) en geeft een
 * uitkomst terug; bij `ok` wordt de route ververst zodat data + tijdstip bijwerken.
 */
export type SyncUitkomst = { ok: boolean; melding?: string }

type Props = {
  laatsteSync: string | null
  onSync: () => Promise<SyncUitkomst>
  /** Knoptekst — alleen afwijken van "Synchroniseer" als er meerdere sync-knoppen op één pagina staan. */
  label?: string
}

export function SyncKnop({ laatsteSync, onSync, label = 'Synchroniseer' }: Props) {
  const router = useRouter()
  const [bezig, setBezig] = useState(false)
  const [resultaat, setResultaat] = useState<SyncUitkomst | null>(null)
  // Herbereken het relatieve label elke minuut (Vandaag → Gisteren over middernacht)
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  async function handleSync() {
    if (bezig) return
    setBezig(true)
    setResultaat(null)
    try {
      const r = await onSync()
      setResultaat(r)
      if (r.ok) router.refresh()
    } catch (e: unknown) {
      // Server-action gekilld (bv. timeout) of netwerkfout: nooit de pagina laten crashen.
      setResultaat({ ok: false, melding: (e as Error)?.message ?? 'Synchronisatie mislukt' })
    } finally {
      setBezig(false)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
      <span style={{ fontSize: 11, color: 'var(--neutral-400)', whiteSpace: 'nowrap' }}>
        Sync: {syncTijdLabel(laatsteSync)}
      </span>
      {resultaat?.melding && (
        <span
          title={resultaat.melding}
          style={{
            fontSize: 12, fontWeight: 600, maxWidth: 320,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            color: resultaat.ok ? 'var(--success-700)' : 'var(--error-500)',
          }}
        >
          {resultaat.ok ? '✓' : '⚠'} {resultaat.melding}
        </span>
      )}
      <Button variant="primary" size="md" loading={bezig} onClick={handleSync}>
        {bezig ? 'Synchroniseren…' : label}
      </Button>
    </div>
  )
}
