'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { syncEnkelDossier } from '@/app/(platform)/instellingen/integraties/actions'

/**
 * Ververst een dossier automatisch uit Bouw7 zodra het geopend wordt (mount op de
 * Informatie-tab, de landingstab bij openen), en toont zolang de sync loopt een dunne
 * indeterminate loading-balk bovenin het scherm.
 *
 * Eén keer per browsersessie per dossier (sessionStorage-guard) zodat tab-wisselen niet
 * telkens een zware sync triggert. De handmatige `DossierVerversKnop` blijft daarnaast
 * gewoon werken. Hergebruikt dezelfde server-action `syncEnkelDossier`.
 */
export function DossierAutoVervers({
  dossierId,
  bouw7Gekoppeld,
}: {
  dossierId: string
  bouw7Gekoppeld: boolean
}) {
  const router = useRouter()
  const [bezig, setBezig] = useState(false)

  useEffect(() => {
    if (!bouw7Gekoppeld) return

    const guardKey = `dossier-ververst:${dossierId}`
    if (typeof window !== 'undefined' && sessionStorage.getItem(guardKey)) return
    // Direct zetten (vóór de async call) zodat een snelle remount niet dubbel triggert.
    sessionStorage.setItem(guardKey, '1')

    let actief = true
    setBezig(true)
    syncEnkelDossier(dossierId)
      .then((r) => {
        if (!actief) return
        if (r.ok) router.refresh()
        else toast.error(r.error)
      })
      .catch((e: unknown) => {
        if (actief) toast.error((e as Error)?.message ?? 'Verversen mislukt')
      })
      .finally(() => {
        if (actief) setBezig(false)
      })

    return () => {
      actief = false
    }
  }, [dossierId, bouw7Gekoppeld, router])

  if (!bezig) return null

  return (
    <div
      role="progressbar"
      aria-label="Dossier wordt ververst uit Bouw7"
      className="fixed inset-x-0 top-0 z-[60] h-[3px] overflow-hidden bg-brand-100"
    >
      <div
        className="h-full w-2/5 rounded-full bg-brand-500"
        style={{ animation: 'dossierLoadBar 1.1s ease-in-out infinite' }}
      />
    </div>
  )
}
