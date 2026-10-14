'use client'

import { useEffect, useState } from 'react'
import { getBonBedragen, type BonBedragen } from '@/lib/verzamelfactuur/bedragen'

/** `undefined` = nog aan het laden, `null` = niet op te halen. */
export type BedragStand = BonBedragen | null | undefined

/**
 * Haalt per bon de geboekte kosten en het factuurbedrag op, vier tegelijk. Elke bon doet een paar
 * Bouw7-aanroepen; zo vult de lijst zich bon voor bon in plaats van te wachten op de traagste.
 * Bij een andere factuurpartij wordt een lopende ronde genegeerd.
 */
export function useBonBedragen(dossierIds: string[]): Map<string, BedragStand> {
  const [bedragen, setBedragen] = useState<Map<string, BedragStand>>(new Map())
  const sleutel = dossierIds.join(',')

  useEffect(() => {
    let actief = true
    setBedragen(new Map())
    const ids = sleutel ? sleutel.split(',') : []
    ;(async () => {
      for (let i = 0; i < ids.length && actief; i += 4) {
        await Promise.all(ids.slice(i, i + 4).map(async id => {
          const b = await getBonBedragen(id).catch(() => null)
          if (actief) setBedragen(prev => new Map(prev).set(id, b))
        }))
      }
    })()
    return () => { actief = false }
  }, [sleutel])

  return bedragen
}
