'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { verwerkDossierTriggers } from '@/app/(platform)/taken/actions/sjablonen'

/**
 * Verwerkt openstaande sjabloon-activeringen voor dit dossier ná mount.
 *
 * Dit vangt activeringen op die door een externe/handmatige DB-write zijn ge-enqueued
 * (de in-app statuswijzigingen en de Bouw7-sync verwerken ze al server-side). Het draait
 * client-side zodat `revalidatePath` (in activeerSjabloon) niet tijdens server-render valt.
 * Alleen bij daadwerkelijk verwerkte activeringen volgt een refresh — geen refresh-loop.
 */
export default function DrainActiveringen({ dossier_id }: { dossier_id: string }) {
  const router = useRouter()
  const gedaan = useRef(false)

  useEffect(() => {
    if (gedaan.current) return
    gedaan.current = true
    verwerkDossierTriggers(dossier_id)
      .then(aantal => { if (aantal > 0) router.refresh() })
      .catch(() => {})
  }, [dossier_id, router])

  return null
}
