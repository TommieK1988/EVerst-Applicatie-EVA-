'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { verwerkMedewerkerTriggers } from '@/app/(platform)/taken/actions/sjablonen'

/**
 * Verwerkt openstaande sjabloon-activeringen voor deze medewerker ná mount.
 *
 * Spiegel van DrainActiveringen op het dossier: vangt activeringen op die door een
 * externe/handmatige DB-write zijn ge-enqueued (de medewerker-server-actions en de
 * Bouw7-sync verwerken ze al server-side). Client-side zodat `revalidatePath` niet
 * tijdens server-render valt; alleen bij verwerkte activeringen volgt een refresh.
 */
export default function DrainMedewerkerActiveringen({ medewerker_id }: { medewerker_id: string }) {
  const router = useRouter()
  const gedaan = useRef(false)

  useEffect(() => {
    if (gedaan.current) return
    gedaan.current = true
    verwerkMedewerkerTriggers(medewerker_id)
      .then(aantal => { if (aantal > 0) router.refresh() })
      .catch(() => {})
  }, [medewerker_id, router])

  return null
}
