'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { syncEnkelDossier } from '@/app/(platform)/instellingen/integraties/actions'

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
    <button
      type="button"
      onClick={ververs}
      disabled={bezig}
      title="Ververs dit dossier uit Bouw7"
      className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center text-neutral-500 opacity-40 transition-opacity hover:opacity-100 disabled:opacity-100"
    >
      <svg
        className={bezig ? 'animate-spin' : ''}
        width="12" height="12" viewBox="0 0 20 20" fill="none"
        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      >
        <path d="M3 10a7 7 0 0 1 12-5l2 2M17 10a7 7 0 0 1-12 5l-2-2M15 3v4h-4M5 17v-4h4" />
      </svg>
    </button>
  )
}
