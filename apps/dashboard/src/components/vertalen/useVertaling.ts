'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTaal } from '@/i18n/client'
import type { Taal } from '@/i18n/talen'
import { vertaalVoorMij } from '@/lib/vertalen/actions'

/**
 * Tijdelijk vertalen van teksten van kantoor in EVA Mobiel.
 *
 * Alle teksten die in hetzelfde moment om een vertaling vragen gaan in één verzoek naar
 * de server (een scherm met twintig taken = één verzoek, niet twintig). Wat al vertaald
 * is blijft in het geheugen van de app, dus terugnavigeren kost niets.
 *
 * In het Nederlands doet dit niets: de tekst komt ongewijzigd terug, zonder verzoek.
 */

type Uitkomst = string | null // null = niet vertaald → origineel tonen

const geheugen = new Map<string, Uitkomst>()
const wachtend = new Map<string, Promise<Uitkomst>>()
let rij: { tekst: string; klaar: (v: Uitkomst) => void }[] = []
let gepland: ReturnType<typeof setTimeout> | null = null

const sleutel = (taal: Taal, tekst: string) => `${taal}\u0000${tekst}`

function verstuur(taal: Taal) {
  gepland = null
  const deze = rij
  rij = []
  const teksten = deze.map((r) => r.tekst)
  vertaalVoorMij(teksten).then(
    (res) => deze.forEach((r, i) => {
      const v = res[i] ?? null
      geheugen.set(sleutel(taal, r.tekst), v)
      wachtend.delete(sleutel(taal, r.tekst))
      r.klaar(v)
    }),
    () => deze.forEach((r) => {
      // Niet in het geheugen: een volgende keer opnieuw proberen.
      wachtend.delete(sleutel(taal, r.tekst))
      r.klaar(null)
    }),
  )
}

function vraag(taal: Taal, tekst: string): Promise<Uitkomst> {
  const k = sleutel(taal, tekst)
  const bestaand = wachtend.get(k)
  if (bestaand) return bestaand
  const p = new Promise<Uitkomst>((klaar) => {
    rij.push({ tekst, klaar })
    gepland ??= setTimeout(() => verstuur(taal), 40)
  })
  wachtend.set(k, p)
  return p
}

export type Vertaling = {
  /** Wat je toont: de vertaling als die er is, anders het origineel. */
  tekst: string
  /** Is `tekst` een vertaling? (Dan hoort er een "Automatisch vertaald"-label bij.) */
  vertaald: boolean
  /** Bezig met vertalen — het origineel staat er zolang. */
  bezig: boolean
  origineel: string
}

/** Vertaal meerdere teksten tegelijk (bijv. alle keuzeopties van een formuliervraag). */
export function useVertalingen(teksten: (string | null | undefined)[]): Vertaling[] {
  const taal = useTaal()
  const lijst = useMemo(() => teksten.map((t) => t ?? ''), [teksten.join('\u0001')]) // eslint-disable-line react-hooks/exhaustive-deps
  const [, herteken] = useState(0)

  useEffect(() => {
    if (taal === 'nl') return
    let actief = true
    const open = lijst.filter((t) => t.trim() && !geheugen.has(sleutel(taal, t)))
    if (open.length === 0) return
    Promise.all(open.map((t) => vraag(taal, t))).then(() => { if (actief) herteken((n) => n + 1) })
    return () => { actief = false }
  }, [taal, lijst])

  return lijst.map((origineel) => {
    if (taal === 'nl' || !origineel.trim()) return { tekst: origineel, vertaald: false, bezig: false, origineel }
    const k = sleutel(taal, origineel)
    if (!geheugen.has(k)) return { tekst: origineel, vertaald: false, bezig: true, origineel }
    const v = geheugen.get(k)
    return v ? { tekst: v, vertaald: true, bezig: false, origineel } : { tekst: origineel, vertaald: false, bezig: false, origineel }
  })
}

/** Vertaal één tekst. */
export function useVertaling(tekst: string | null | undefined): Vertaling {
  return useVertalingen([tekst])[0]
}
