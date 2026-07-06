'use client'

import { SyncKnop, type SyncUitkomst } from '@/components/eva/SyncKnop'
import { syncPlanningVoorDossier } from '@/app/(platform)/planning/actions'
import { useDossierReadOnly } from '@/components/dossiers/DossierReadOnlyContext'

export default function SyncBouw7PlanningKnop({
  dossier_id,
  laatstSync,
}: {
  dossier_id: string
  laatstSync?: string | null
}) {
  const readOnly = useDossierReadOnly()
  if (readOnly) return null

  async function handleSync(): Promise<SyncUitkomst> {
    const result = await syncPlanningVoorDossier(dossier_id)
    if (!result.ok) return { ok: false, melding: result.error }
    if (result.fouten > 0) {
      return { ok: true, melding: `${result.nieuw} activiteit(en) gesynchroniseerd, ${result.fouten} overgeslagen` }
    }
    return { ok: true, melding: `${result.nieuw} activiteit(en) uit Bouw7` }
  }

  return (
    <SyncKnop
      laatsteSync={laatstSync ?? null}
      onSync={handleSync}
      label="Sync planning (Bouw7)"
    />
  )
}
