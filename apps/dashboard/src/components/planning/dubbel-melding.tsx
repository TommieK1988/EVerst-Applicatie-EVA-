'use client'

import toast from 'react-hot-toast'
import type { DubbeleInplanning } from '@/lib/planning/dubbel-ingepland'

const MAX_REGELS = 5

/**
 * Waarschuwing na het opslaan als iemand nu dubbel staat: over een ander planitem (ook in
 * een ander dossier) of over verlof/ziekte heen. Het planitem is dan al opgeslagen — dit is
 * een melding, geen blokkade. Blijft langer staan dan een gewone toast, zodat er tijd is om
 * te lezen met wie het botst.
 */
export function meldDubbeleInplanning(dubbel: DubbeleInplanning[] | undefined): void {
  if (!dubbel || dubbel.length === 0) return

  const medewerkers = [...new Set(dubbel.map(d => d.medewerker))]
  const kop = medewerkers.length === 1
    ? `${medewerkers[0]} staat dubbel ingepland`
    : `${medewerkers.length} medewerkers staan dubbel ingepland`
  const regels = dubbel.slice(0, MAX_REGELS)

  toast(
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, lineHeight: 1.4 }}>
      <strong>{kop}</strong>
      {regels.map((d, i) => (
        <span key={i} style={{ color: 'var(--fg-muted)' }}>
          {medewerkers.length > 1 && <>{d.medewerker}: </>}
          {d.soort === 'afwezig' ? <strong>{d.wat}</strong> : d.wat} · {d.wanneer}
        </span>
      ))}
      {dubbel.length > MAX_REGELS && (
        <span style={{ color: 'var(--fg-muted)' }}>en nog {dubbel.length - MAX_REGELS} andere</span>
      )}
    </div>,
    { icon: '⚠️', duration: 12_000, style: { maxWidth: 440 } },
  )
}
