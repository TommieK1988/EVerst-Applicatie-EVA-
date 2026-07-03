'use client'

import { syncProjects, type DossierSyncScope } from '@/lib/bouw7/sync'
import { SyncKnop, type SyncUitkomst } from '@/components/eva/SyncKnop'

/**
 * Sync-knop op de dossier-lijstpagina's. Ververst alléén de dossiers van de eigen sectie
 * (scope) uit Bouw7 — de cron-sync haalt 2×/dag de volledige set op.
 */
type Props = { lasteSyncIso: string | null; scope: DossierSyncScope }

export function BouwSyncKnop({ lasteSyncIso, scope }: Props) {
  async function handleSync(): Promise<SyncUitkomst> {
    const r = await syncProjects({ scope })
    if (r.fouten > 0) return { ok: false, melding: r.foutMelding ?? `${r.fouten} fout(en)` }
    return { ok: true, melding: `${r.nieuw} nieuw · ${r.bijgewerkt} bijgewerkt` }
  }

  return <SyncKnop laatsteSync={lasteSyncIso} onSync={handleSync} />
}
