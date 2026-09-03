'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { InklapbareCard, Switch } from '@/components/ui'
import { getDossierToggles, setDossierToggle, type DossierToggle } from '@/lib/dossiers/actions'
import { useDossierReadOnly } from './DossierReadOnlyContext'

/**
 * Toont de actieve dossier-toggles als aan/uit-schakelaars. Bij wijziging wordt
 * de stand opgeslagen en worden trigger-evaluaties uitgevoerd (via setDossierToggle);
 * een refresh toont eventueel automatisch geactiveerde actielijsten.
 */
export default function DossierTogglesPaneel({ dossierId, hoogte }: {
  dossierId: string
  /** Ingeklapte hoogte; meegegeven door de kaartengrid zodat alle blokken gelijk staan. */
  hoogte?: number
}) {
  const router = useRouter()
  const readOnly = useDossierReadOnly()
  const [toggles, setToggles] = useState<DossierToggle[] | null>(null)
  const [bezig, setBezig] = useState<string | null>(null)

  useEffect(() => {
    getDossierToggles(dossierId).then(setToggles).catch(() => setToggles([]))
  }, [dossierId])

  if (!toggles || toggles.length === 0) return null

  async function zet(definitie_id: string, aan: boolean) {
    setBezig(definitie_id)
    // Optimistisch bijwerken
    setToggles(prev => prev?.map(t => t.definitie_id === definitie_id ? { ...t, aan } : t) ?? prev)
    const r = await setDossierToggle(dossierId, definitie_id, aan)
    setBezig(null)
    if (!r.ok) {
      toast.error(r.error)
      setToggles(prev => prev?.map(t => t.definitie_id === definitie_id ? { ...t, aan: !aan } : t) ?? prev)
      return
    }
    router.refresh()
  }

  return (
    <InklapbareCard titel="Toggles" hoogte={hoogte}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {toggles.map(t => (
            <label key={t.definitie_id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              cursor: 'pointer',
            }}>
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg)' }}>{t.label}</span>
              <Switch
                checked={t.aan}
                disabled={readOnly || bezig === t.definitie_id}
                onCheckedChange={(v: boolean) => zet(t.definitie_id, v)}
              />
            </label>
          ))}
        </div>
    </InklapbareCard>
  )
}
