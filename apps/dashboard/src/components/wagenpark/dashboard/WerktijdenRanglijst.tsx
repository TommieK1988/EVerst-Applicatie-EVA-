'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import type { GebruikerLayout } from '@everts/database/platform-types'
import type { Periode } from '@/lib/wagenpark/periode'
import SamenvattingTabel from '@/components/wagenpark/werktijden/SamenvattingTabel'
import type { WerktijdRij } from '@/components/wagenpark/werktijden/WerktijdenTabel'

/**
 * Werktijden per medewerker op het wagenpark-dashboard: wie springt eruit in de
 * gekozen periode?
 *
 * Dun schilletje om `SamenvattingTabel`: het enige wat hier bij komt is dat een
 * klik op een regel doorgaat naar de bestuurder, want dáár staan zijn dagen, het
 * zijpaneel om ze af te vinken en de uitdraai.
 */
export default function WerktijdenRanglijst({
  data,
  periode,
  layouts,
  user_id,
}: {
  data: WerktijdRij[]
  periode: Periode
  layouts: GebruikerLayout[]
  user_id: string | null
}) {
  const router = useRouter()

  return (
    <SamenvattingTabel
      // De maandkolommen horen bij de gekozen periode. Ze zijn `vast`, maar de
      // bewaarde kolomstand wordt alleen bij het opbouwen van de tabel
      // toegepast — zonder deze sleutel blijft een al gemonteerde tabel de
      // maanden van de vorige periode tonen.
      key={`${periode.van}|${periode.tot}`}
      data={data}
      layouts={layouts}
      user_id={user_id}
      periode={periode}
      onMedewerkerKlik={(rij) => router.push(`/wagenpark/bestuurders/${rij.id}#werktijden`)}
    />
  )
}
