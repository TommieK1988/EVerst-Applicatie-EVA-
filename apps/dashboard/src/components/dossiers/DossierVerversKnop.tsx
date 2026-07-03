'use client'

import { syncEnkelDossier } from '@/app/(platform)/instellingen/integraties/actions'
import { SyncKnop, type SyncUitkomst } from '@/components/eva/SyncKnop'

/**
 * Ververs één dossier direct uit Bouw7 (dossiers/projectvelden + financiën + offerte + planning),
 * zonder de hele set te synchroniseren. Roept de scoped server-action `syncEnkelDossier` aan.
 */
export function DossierVerversKnop({ dossierId, laatsteSync }: { dossierId: string; laatsteSync: string | null }) {
  async function ververs(): Promise<SyncUitkomst> {
    const r = await syncEnkelDossier(dossierId)
    if (!r.ok) return { ok: false, melding: r.error }
    return { ok: true, melding: 'Dossier bijgewerkt uit Bouw7' }
  }

  return <SyncKnop laatsteSync={laatsteSync} onSync={ververs} />
}
