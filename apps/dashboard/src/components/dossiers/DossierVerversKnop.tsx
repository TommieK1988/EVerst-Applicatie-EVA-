'use client'

import { syncEnkelDossier } from '@/app/(platform)/instellingen/integraties/actions'
import { SyncKnop, type SyncUitkomst } from '@/components/eva/SyncKnop'
import { vernieuwDossierSnapshots } from '@/lib/bouw7/snapshot-actions'

/**
 * Ververs één dossier volledig uit Bouw7: eerst de projectvelden/offerte/planning
 * (`syncEnkelDossier`), daarna alle snapshots waaruit de tabs lezen (financiën, inkoop, verkoop,
 * uren, bestanden). Dit is de knop voor "ik wil nú de actuele stand", los van de tweemaal-daagse
 * cron; per tab zit er een lichtere variant boven de tabel.
 */
export function DossierVerversKnop({ dossierId, laatsteSync }: { dossierId: string; laatsteSync: string | null }) {
  async function ververs(): Promise<SyncUitkomst> {
    const r = await syncEnkelDossier(dossierId)
    if (!r.ok) return { ok: false, melding: r.error }

    const snap = await vernieuwDossierSnapshots(dossierId)
    if (snap.fouten.length > 0) {
      return { ok: true, melding: `Dossier bijgewerkt; ${snap.fouten.length} onderdeel(en) niet opgehaald` }
    }
    return { ok: true, melding: 'Dossier bijgewerkt uit Bouw7' }
  }

  return <SyncKnop laatsteSync={laatsteSync} onSync={ververs} />
}
