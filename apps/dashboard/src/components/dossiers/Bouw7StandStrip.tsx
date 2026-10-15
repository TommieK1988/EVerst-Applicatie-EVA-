'use client'

import { syncTijdLabel } from '@/lib/sync-tijd'
import type { SnapshotTab } from '@/lib/bouw7/snapshot-soorten'

/**
 * Regeltje bovenaan een dossiertab — alleen als er iets mis is met de Bouw7-cijfers.
 *
 * EVA haalt deze gegevens niet op bij het openen van een scherm; de cron ververst ze twee keer per
 * dag (sync + snapshots in één ronde) en de knop Synchroniseer in de topbalk doet het op verzoek.
 * Die topbalk toont de ene synctijd van het dossier. Een eigen tijd per tab gaf alleen verwarring
 * ("02:31 boven, 03:01 hier"), dus dit regeltje zwijgt zolang de stand gewoon actueel is en
 * meldt zich alleen bij: nooit opgehaald, onderdelen die ontbreken, een mislukte poging, of
 * cijfers die duidelijk ouder zijn dan de laatste ronde (meer dan een dag).
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

/** Ouder dan dit = de laatste rondes hebben dit tab niet bijgewerkt; dat hoort de gebruiker te zien. */
const VEROUDERD_NA_MS = 26 * 60 * 60 * 1000

export function Bouw7StandStrip({ opgehaaldOp, ontbreekt = [], fout }: Bouw7StandProps) {
  const nooitOpgehaald = opgehaaldOp == null
  const verouderd = !nooitOpgehaald && Date.now() - Date.parse(opgehaaldOp) > VEROUDERD_NA_MS
  if (!nooitOpgehaald && !verouderd && ontbreekt.length === 0 && !fout) return null

  const tekst = nooitOpgehaald
    ? 'Nog niet opgehaald uit Bouw7 — klik Synchroniseer rechtsboven'
    : verouderd
      ? `Cijfers uit Bouw7 van ${syncTijdLabel(opgehaaldOp).toLowerCase()}`
      : null

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        padding: '4px 0 12px', fontSize: 11, color: 'var(--neutral-400)',
      }}
    >
      {tekst && <span style={{ color: nooitOpgehaald ? 'var(--warning-700, #8a6d3b)' : undefined }}>{tekst}</span>}

      {ontbreekt.length > 0 && !nooitOpgehaald && (
        <span title={ontbreekt.join(', ')} style={{ color: 'var(--warning-700, #8a6d3b)' }}>
          {tekst ? '· ' : ''}{ontbreekt.length} onderdeel{ontbreekt.length === 1 ? '' : 'en'} nog niet opgehaald
        </span>
      )}

      {fout && (
        <span title={fout} style={{ color: 'var(--error-500)' }}>
          {tekst || ontbreekt.length > 0 ? '· ' : ''}⚠ laatste poging uit Bouw7 mislukt
        </span>
      )}
    </div>
  )
}
