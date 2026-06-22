'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { syncEnkelDossier } from '@/app/(platform)/instellingen/integraties/actions'
import { Button } from '@/components/ui'

/**
 * Ververs één dossier direct uit Bouw7 (dossiers/projectvelden + financiën + offerte + planning),
 * zonder de hele set te synchroniseren. Roept de scoped server-action `syncEnkelDossier` aan.
 */
export function DossierVerversKnop({ dossierId }: { dossierId: string }) {
  const router = useRouter()
  const [bezig, setBezig] = useState(false)

  async function ververs() {
    if (bezig) return
    setBezig(true)
    try {
      const r = await syncEnkelDossier(dossierId)
      if (r.ok) {
        toast.success('Dossier bijgewerkt uit Bouw7')
        router.refresh()
      } else {
        toast.error(r.error)
      }
    } catch (e: unknown) {
      toast.error((e as Error)?.message ?? 'Verversen mislukt')
    } finally {
      setBezig(false)
    }
  }

  return (
    <Button
      variant="ghost"
      loading={bezig}
      onClick={ververs}
      title="Ververs dit dossier uit Bouw7"
    >
      <svg
        width="14" height="14" viewBox="0 0 20 20" fill="none"
        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      >
        <path d="M3 10a7 7 0 0 1 12-5l2 2M17 10a7 7 0 0 1-12 5l-2-2M15 3v4h-4M5 17v-4h4" />
      </svg>
      Ververs
    </Button>
  )
}
