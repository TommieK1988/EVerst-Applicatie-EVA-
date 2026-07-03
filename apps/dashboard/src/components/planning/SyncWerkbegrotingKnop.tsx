'use client'

import { SyncKnop, type SyncUitkomst } from '@/components/eva/SyncKnop'
import { syncWerkbegrotingVanEvertsCalc } from '@/app/(platform)/planning/actions'

/**
 * Handmatige overname van de everts-calc werkbegroting. De overname gebeurt ook
 * automatisch zodra een offerte opdracht wordt — deze knop is het vangnet voor
 * bijv. een later gewijzigde calculatie.
 */
export default function SyncWerkbegrotingKnop({
  dossier_id,
  laatstSync,
}: {
  dossier_id: string
  laatstSync?: string | null
}) {
  async function handleSync(): Promise<SyncUitkomst> {
    const result = await syncWerkbegrotingVanEvertsCalc(dossier_id)
    if (!result.ok) return { ok: false, melding: result.error }
    if (result.ongematch.length > 0) {
      return { ok: true, melding: `${result.gematch} uursoort(en) gesynchroniseerd. Niet gematcht: ${result.ongematch.join(', ')}` }
    }
    return { ok: true, melding: `${result.gematch} uursoort(en) overgenomen` }
  }

  return (
    <SyncKnop
      laatsteSync={laatstSync ?? null}
      onSync={handleSync}
      label="Sync werkbegroting (everts-calc)"
    />
  )
}
