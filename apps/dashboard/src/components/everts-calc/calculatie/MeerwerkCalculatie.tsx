'use client'

/**
 * MeerwerkCalculatie — de calculatie-omgeving van één meerwerkregel, gebonden aan het
 * eigen everts-calc project van dat meerwerk (meerwerk_regels.calc_project_id). Volledig
 * geïsoleerd van de contractcalculatie. Spiegelt AanvraagCalculatieTab, maar het project
 * bestaat al (server-side aangemaakt door maakMeerwerkCalculatie) — dus géén koppel-stap.
 *
 * Flow: verse meerwerk-calculatie → direct de editor in (0 versies). Zodra er ≥1 versie is
 * landt hij op de versie-kiezer. De offerte maak je via de normale "Offerte aanmaken"-modal
 * (met lay-out-keuze); die wordt als meerwerk-offerte gekoppeld (meerwerkRegelId).
 */

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import toast from 'react-hot-toast'
import { ArrowLeft } from 'lucide-react'
import CalculatieHoofdscherm from './CalculatieHoofdscherm'
import CalculatiesTabel from './CalculatiesTabel'
import OfferteDetail from './OfferteDetail'
import { laadCalculatieSnapshot } from '@/app/(platform)/everts-calc/actions/sync'
import { getMeerwerkCalcQuotes } from '@/lib/dossiers/meerwerk'
import { getScenarios, hydrateCalculatie } from '@/lib/everts-calc/local-store'
import { reviseerCalculatie } from '@/lib/everts-calc/versie'
import { useDossierReadOnly } from '@/components/dossiers/DossierReadOnlyContext'
import { Button } from '@/components/ui'
import type { Scenario } from '@/lib/everts-calc/types'
import type { DossierQuoteRij } from '@/lib/everts-calc/services/quotes'

interface Props {
  /** Eigen everts-calc project van dit meerwerk. */
  projectId: string
  /** Dossier waarin het meerwerk zit — voor de offerte-render en context. */
  dossierId: string
  /** Meerwerkregel — de offerte die hier ontstaat wordt als meerwerk-offerte gekoppeld. */
  meerwerkRegelId: string
  naam: string
  nummer: string
  clientNaam?: string | null
  /** Direct een gekoppelde offerte inline openen (vanuit "Open offerte" op de lijst). */
  initialOfferteId?: string | null
  /** Terug naar de meerwerk-lijst. */
  onTerug: () => void
}

export default function MeerwerkCalculatie({
  projectId, dossierId, meerwerkRegelId, naam, nummer, clientNaam, initialOfferteId, onTerug,
}: Props) {
  const readOnly = useDossierReadOnly()
  const searchParams = useSearchParams()

  const [offerteId, setOfferteId] = useState<string | null>(initialOfferteId ?? null)
  useEffect(() => {
    const q = searchParams.get('offerte')
    if (q) setOfferteId(q)
  }, [searchParams])

  const [scenarios, setScenarios]                   = useState<Scenario[]>([])
  const [rijen, setRijen]                           = useState<DossierQuoteRij[]>([])
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null)
  const [toonCalculatie, setToonCalculatie]         = useState(false)
  const [calcTick, setCalcTick]                     = useState(0)
  const [gehydrateerd, setGehydrateerd]             = useState(false)

  // Hydrateer de gedeelde calculatie uit Supabase (één keer per project, vóór het grid
  // rendert). Draait bewust NIET op calcTick, anders zou een lokaal net-gekopieerde (nog
  // niet opgeslagen) calculatie overschreven worden.
  useEffect(() => {
    let actief = true
    setGehydrateerd(false)
    ;(async () => {
      try {
        const snap = await laadCalculatieSnapshot(projectId)
        if (actief && snap) hydrateCalculatie(projectId, snap)
      } catch { /* val terug op lokaal */ }
      finally { if (actief) setGehydrateerd(true) }
    })()
    return () => { actief = false }
  }, [projectId])

  useEffect(() => {
    if (!gehydrateerd) { setScenarios([]); return }
    setScenarios(getScenarios(projectId))
  }, [projectId, gehydrateerd, calcTick])

  // Offertes van het meerwerk-project (voor de versie-kiezer). Herladen na hydratie,
  // na lokale wijzigingen en zodra een geopende offerte weer gesloten wordt.
  useEffect(() => {
    if (!gehydrateerd) return
    let actief = true
    getMeerwerkCalcQuotes(projectId).then(r => { if (actief) setRijen(r) }).catch(() => {})
    return () => { actief = false }
  }, [projectId, gehydrateerd, calcTick, offerteId])

  // Verse meerwerk-calculatie zonder versie → meteen de editor in om te bouwen.
  useEffect(() => {
    if (gehydrateerd && scenarios.length === 0) setToonCalculatie(true)
  }, [gehydrateerd, scenarios.length])

  const handleScenariosGewijzigd = (nieuwId?: string) => {
    setCalcTick(t => t + 1)
    if (nieuwId) { setSelectedScenarioId(nieuwId); setToonCalculatie(true) }
  }
  const handleReviseer = async (sid: string) => {
    const nieuw = await reviseerCalculatie(projectId, sid)
    if (!nieuw) { toast.error('Reviseren mislukt'); return }
    toast.success('Nieuwe versie aangemaakt')
    handleScenariosGewijzigd(nieuw.id)
  }

  const terugKnop = (label: string, onClick: () => void) => (
    <div className="px-8 pt-4">
      <Button variant="ghost" onClick={onClick}>
        <ArrowLeft className="h-3.5 w-3.5" />
        {label}
      </Button>
    </div>
  )

  // Inline offerte-detail (bekijken/goedkeuren/verzenden).
  if (offerteId) {
    return (
      <div style={{ padding: '24px 32px' }}>
        <OfferteDetail
          quoteId={offerteId}
          dossierId={dossierId}
          onTerug={() => { setOfferteId(null); setCalcTick(t => t + 1) }}
        />
      </div>
    )
  }

  if (!gehydrateerd) {
    return (
      <div style={{ padding: '56px 40px', display: 'flex', justifyContent: 'center' }}>
        <p style={{ fontSize: 13, color: 'var(--fg-muted)', margin: 0 }}>Meerwerk-calculatie laden…</p>
      </div>
    )
  }

  // Versie-kiezer zodra er ≥1 calculatie is en de omgeving niet expliciet geopend is.
  if (scenarios.length > 0 && !toonCalculatie) {
    return (
      <div>
        {terugKnop('Terug naar meerwerk', onTerug)}
        <CalculatiesTabel
          projectId={projectId}
          scenarios={scenarios}
          rijen={rijen}
          tick={calcTick}
          readOnly={readOnly}
          onOpenCalculatie={(sid) => { setSelectedScenarioId(sid); setToonCalculatie(true) }}
          onOpenOfferte={setOfferteId}
          onReviseer={handleReviseer}
        />
      </div>
    )
  }

  // Een gekozen (of nieuwe) calculatie → de calculatie-omgeving.
  return (
    <div>
      {terugKnop(
        scenarios.length > 0 ? 'Terug naar versies' : 'Terug naar meerwerk',
        () => {
          if (scenarios.length > 0) { setToonCalculatie(false); setSelectedScenarioId(null) }
          else onTerug()
        },
      )}
      <CalculatieHoofdscherm
        projectId={projectId}
        projectNaam={naam}
        projectNummer={nummer}
        toonProjectDetail
        readOnly={readOnly}
        scenarioId={selectedScenarioId ?? undefined}
        dossierContext={{ dossierId, clientNaam, meerwerkRegelId }}
        onScenariosGewijzigd={handleScenariosGewijzigd}
      />
    </div>
  )
}
