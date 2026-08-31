'use client'

/**
 * MeerwerkCalculatie — opent de calculatie van één meerwerkregel. De calculatie is een
 * scenario ín het dossier-project (dossiers.everts_calc_project_id), gemarkeerd met
 * meerwerk_regel_id, zodat hij onder het Calculatie-tab in een eigen "Meerwerk-calculaties"-
 * blok verschijnt (geen apart project meer). Dit component hydrateert het dossier-project,
 * zoekt (of maakt) het meerwerk-scenario en opent de calculatie-omgeving erop. De offerte
 * maak je daar via de normale "Offerte aanmaken"-modal (met lay-out-keuze); die wordt
 * automatisch als meerwerk-offerte gekoppeld (op basis van scenario.meerwerk_regel_id).
 * Een verzonden meerwerk-offerte is te reviseren: dat maakt een nieuwe versie van het
 * meerwerk-scenario (met dezelfde meerwerk_regel_id), die hier meteen geopend wordt.
 */

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import CalculatieHoofdscherm from './CalculatieHoofdscherm'
import OfferteDetail from './OfferteDetail'
import { laadCalculatieSnapshot } from '@/app/(platform)/everts-calc/actions/sync'
import { hydrateCalculatie } from '@/lib/everts-calc/local-store'
import { maakMeerwerkScenario, vindMeerwerkScenario } from '@/lib/everts-calc/versie'
import { useDossierReadOnly } from '@/components/dossiers/DossierReadOnlyContext'
import { Button } from '@/components/ui'

interface Props {
  /** Dossier-project (dossiers.everts_calc_project_id) waarin het meerwerk-scenario leeft. */
  projectId: string
  /** Dossier waarin het meerwerk zit — voor de offerte-render en context. */
  dossierId: string
  /** Meerwerkregel — de calculatie/offerte wordt hieraan gekoppeld. */
  meerwerkRegelId: string
  /** Omschrijving van het meerwerk — naam van het scenario. */
  omschrijving: string
  /** Dossier-naam/-nummer + klant voor de calculatie-omgeving. */
  naam: string
  nummer: string
  clientNaam?: string | null
  /** Direct een gekoppelde offerte inline openen (vanuit "Open offerte" op de lijst). */
  initialOfferteId?: string | null
  /** Terug naar de meerwerk-lijst. */
  onTerug: () => void
}

export default function MeerwerkCalculatie({
  projectId, dossierId, meerwerkRegelId, omschrijving, naam, nummer, clientNaam, initialOfferteId, onTerug,
}: Props) {
  const readOnly = useDossierReadOnly()
  const searchParams = useSearchParams()

  const [offerteId, setOfferteId] = useState<string | null>(initialOfferteId ?? null)
  useEffect(() => {
    const q = searchParams.get('offerte')
    if (q) setOfferteId(q)
  }, [searchParams])

  const [scenarioId, setScenarioId] = useState<string | null>(null)
  const [gereed, setGereed]         = useState(false)
  const [fout, setFout]             = useState<string | null>(null)

  // Hydrateer het dossier-project (vóór het grid rendert, zodat de andere scenario's
  // niet overschreven worden), zoek dan het meerwerk-scenario of maak het aan.
  useEffect(() => {
    let actief = true
    setGereed(false); setFout(null); setScenarioId(null)
    ;(async () => {
      try {
        const snap = await laadCalculatieSnapshot(projectId)
        if (!actief) return
        if (snap) hydrateCalculatie(projectId, snap)

        let sc = vindMeerwerkScenario(projectId, meerwerkRegelId)
        if (!sc && !readOnly) {
          sc = await maakMeerwerkScenario(projectId, meerwerkRegelId, `Meerwerk — ${omschrijving}`)
        }
        if (!actief) return
        setScenarioId(sc?.id ?? null)
      } catch (e) {
        if (actief) setFout(e instanceof Error ? e.message : 'Meerwerk-calculatie laden mislukt.')
      } finally {
        if (actief) setGereed(true)
      }
    })()
    return () => { actief = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, meerwerkRegelId])

  const terugKnop = (
    <div className="px-8 pt-4">
      <Button variant="ghost" onClick={onTerug}>
        <ArrowLeft className="h-3.5 w-3.5" />
        Terug naar meerwerk
      </Button>
    </div>
  )

  // Inline offerte-detail (bekijken/goedkeuren/verzenden).
  if (offerteId) {
    return (
      <div style={{ padding: '12px 32px' }}>
        <OfferteDetail
          quoteId={offerteId}
          dossierId={dossierId}
          onTerug={() => setOfferteId(null)}
        />
      </div>
    )
  }

  if (!gereed) {
    return (
      <div style={{ padding: '56px 40px', display: 'flex', justifyContent: 'center' }}>
        <p style={{ fontSize: 13, color: 'var(--fg-muted)', margin: 0 }}>Meerwerk-calculatie laden…</p>
      </div>
    )
  }

  if (fout || !scenarioId) {
    return (
      <div>
        {terugKnop}
        <div style={{ padding: '40px', textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: 'var(--fg-muted)', margin: 0 }}>
            {fout ?? (readOnly
              ? 'Dit meerwerk heeft nog geen calculatie en het dossier is alleen-lezen.'
              : 'Geen meerwerk-calculatie beschikbaar.')}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div>
      {terugKnop}
      <CalculatieHoofdscherm
        projectId={projectId}
        projectNaam={naam}
        projectNummer={nummer}
        toonProjectDetail
        readOnly={readOnly}
        scenarioId={scenarioId}
        dossierContext={{ dossierId, clientNaam }}
        magReviseren="meerwerk"
        onScenariosGewijzigd={(nieuwId) => { if (nieuwId) setScenarioId(nieuwId) }}
      />
    </div>
  )
}
