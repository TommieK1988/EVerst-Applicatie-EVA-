'use client'

import { useEffect, useMemo, useState } from 'react'
import { offerteKeuzesBestaan } from '@/lib/everts-calc/offerte-keuzes'
import { getGroepen, globaalUurtarief } from '@/lib/everts-calc/local-store'
import { useInstellingen } from '@/lib/everts-calc/use-instellingen'
import { controleerCalculatie, telControle } from '@/lib/everts-calc/controle'
import type { Scenario, Calculatieregel, Componentregel } from '@/lib/everts-calc/types'

/**
 * De controlepunten van de geopende calculatie, live bijgewerkt bij elke wijziging.
 *
 * `punten` is voor het controlepaneel (met het punt voorwaarden); `puntenVoorOfferte`
 * laat dat punt weg, want in het offertevenster is dat stap 2.
 */
export function useCalculatieControle({ scenario, regels, componenten, kostprijs, verkoopprijs, versie }: {
  scenario: Scenario | null
  regels: Calculatieregel[]
  componenten: Componentregel[]
  kostprijs: number
  verkoopprijs: number
  /** Teller die bij elke wijziging ophoogt; groepsnamen staan niet in de andere invoer. */
  versie: number
}) {
  // Gekozen én nog bestaand (niet gearchiveerd). Asynchroon: de lijsten komen van de server.
  const [voorwaardenGekozen, setVoorwaardenGekozen] = useState(true)
  const conditieId = scenario?.betalingsconditie_id
  const voorwaardenId = scenario?.algemene_voorwaarden_id
  useEffect(() => {
    let weg = false
    offerteKeuzesBestaan(conditieId, voorwaardenId).then(ok => { if (!weg) setVoorwaardenGekozen(ok) })
    return () => { weg = true }
  }, [conditieId, voorwaardenId])

  const scenarioId = scenario?.id
  const groepen = useMemo(() => (scenarioId ? getGroepen(scenarioId) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scenarioId, versie])

  const bevestigd = scenario?.controle_bevestigd
  // Opnieuw rekenen zodra de uurtarieven uit Stamgegevens binnen zijn.
  const instellingen = useInstellingen()
  const calculatietarief = scenario?.standaard_uurtarief || globaalUurtarief()
  const invoer = { groepen, regels, componenten, kostprijs, verkoopprijs, voorwaardenGekozen, bevestigd, calculatietarief }
  const punten = useMemo(() => controleerCalculatie(invoer),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groepen, regels, componenten, kostprijs, verkoopprijs, voorwaardenGekozen, bevestigd, calculatietarief, instellingen])
  const puntenVoorOfferte = useMemo(() => punten.filter(p => p.soort !== 'geen_voorwaarden'), [punten])

  return { punten, puntenVoorOfferte, tellers: telControle(punten) }
}
