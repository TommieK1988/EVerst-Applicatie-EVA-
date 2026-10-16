'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { getUitvraagPakketten } from '@/lib/dossiers/uitvraag-pakketten'
import type { UitvraagPakket } from '@/lib/dossiers/uitvraag-pakket-types'

/**
 * De uitvraagpakketten van een dossier, met een herlaadfunctie. Zonder dossier niets.
 * Een fout wordt een toast en een lege lijst: de calculatie moet blijven werken, ook als
 * de uitvragen even niet te laden zijn.
 */
export function useUitvraagPakketten(dossierId: string | null | undefined) {
  const [pakketten, setPakketten] = useState<UitvraagPakket[]>([])
  const [laden, setLaden] = useState(false)
  const [fout, setFout] = useState<string | null>(null)
  const verzoek = useRef(0)

  const herlaad = useCallback(async () => {
    if (!dossierId) { setPakketten([]); return }
    const nr = ++verzoek.current
    setLaden(true)
    try {
      const data = await getUitvraagPakketten(dossierId)
      if (nr !== verzoek.current) return
      setPakketten(data)
      setFout(null)
    } catch (e) {
      if (nr !== verzoek.current) return
      const melding = e instanceof Error ? e.message : 'Uitvragen laden mislukt'
      setFout(melding)
      toast.error(`Uitvragen laden mislukt: ${melding}`, { id: 'uitvragen-laden' })
    } finally {
      if (nr === verzoek.current) setLaden(false)
    }
  }, [dossierId])

  useEffect(() => { void herlaad() }, [herlaad])

  return { pakketten, laden, fout, herlaad }
}
