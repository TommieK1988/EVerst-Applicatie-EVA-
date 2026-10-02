'use client'

/**
 * Vult de bedragen van lopende servicedeskbonnen aan nadat het scherm er al staat.
 *
 * De server levert die bonnen met `bedragExclBtw: null`: hun contracttotaal kost per bon zo'n
 * twintig lezingen en hield de pagina bij de drukste klant acht seconden vast. Tot het antwoord
 * er is, heeft het blok géén totaal (`klaar: false`) — een totaal zonder de lopende bonnen erin
 * dat daarna omhoog springt is erger dan een paar seconden niets. Dat is ook hoe het
 * servicedeskbord het doet.
 */

import React from 'react'
import { isAfgerond } from '@/lib/commercie/contactpersoon-groepen'
import type { DossierMetBedrag } from '@/lib/commercie/klantbeeld-types'
import { laadServicedeskBedragenActie } from '@/app/m/commercieel/actions'

export function useServicedeskBedragen(lijst: DossierMetBedrag[]): {
  dossiers: DossierMetBedrag[]
  /** False zolang er lopende bonnen op hun bedrag wachten. */
  klaar: boolean
} {
  const lopend = React.useMemo(
    () => lijst.filter(d => d.servicedesk_substatus && !isAfgerond(d)).map(d => d.id),
    [lijst],
  )
  const sleutel = lopend.join(',')
  const [bedragen, setBedragen] = React.useState<Record<string, number | null> | null>(null)

  React.useEffect(() => {
    if (!sleutel) return
    let actief = true
    laadServicedeskBedragenActie(sleutel.split(',')).then(res => {
      // Mislukt: lege uitkomst, zodat het blok niet eeuwig op een totaal blijft wachten.
      if (actief) setBedragen(res.ok ? res.data : {})
    })
    return () => { actief = false }
  }, [sleutel])

  const dossiers = React.useMemo(
    () => bedragen
      ? lijst.map(d => (d.id in bedragen ? { ...d, bedragExclBtw: bedragen[d.id] } : d))
      : lijst,
    [lijst, bedragen],
  )
  return { dossiers, klaar: lopend.length === 0 || bedragen !== null }
}
