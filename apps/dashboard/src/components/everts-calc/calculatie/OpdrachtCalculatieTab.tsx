'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import OfferteDetail from './OfferteDetail'
import toast from 'react-hot-toast'
import { Calculator, ArrowLeft, Trash2 } from 'lucide-react'
import { Card, CardHeader, CardBody, Button } from '@/components/ui'
import { koppelCalculatieProject, deleteCalculatieVanDossier } from '@/lib/dossiers/actions'
import type { DossierQuoteRij } from '@/lib/everts-calc/services/quotes'
import CalculatieHoofdscherm from './CalculatieHoofdscherm'
import CalculatiesTabel from './CalculatiesTabel'
import { slaAanvraagProjectIdOp } from './AanvraagCalculatieTab'
import { getScenarios } from '@/lib/everts-calc/local-store'
import type { Scenario } from '@/lib/everts-calc/types'
import { useDossierReadOnly } from '@/components/dossiers/DossierReadOnlyContext'

type Props = {
  dossierId: string
  naam: string
  nummer: string
  /** Klantnaam (opdrachtgever) — voor het aanmaken van offertes vanuit de calculatie. */
  clientNaam?: string | null
  /** Gekoppeld everts-calc project (dossiers.everts_calc_project_id). */
  projectId: string | null
  /** Aanmaakdatum van het calculatieproject (projects.created_at). */
  projectAangemaakt: string | null
  /** Alle aan het dossier gekoppelde calculaties/offertes (incl. meerwerk), server-side opgehaald. */
  rijen: DossierQuoteRij[]
}

export function OpdrachtCalculatieTab({ dossierId, naam, nummer, clientNaam, projectId, rijen }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const readOnly = useDossierReadOnly()
  const [toonCalculatie, setToonCalculatie] = useState(false)
  // Inline geopende offerte (master-detail); ook via ?offerte={id} na aanmaken.
  const [offerteId, setOfferteId] = useState<string | null>(null)
  useEffect(() => {
    const q = searchParams.get('offerte')
    if (q) setOfferteId(q)
  }, [searchParams])
  const [bezig, setBezig] = useState(false)
  const [deleteInProgress, setDeleteInProgress] = useState(false)
  // Calculaties (scenario's) van dit project — meerdere ontstaan door kopiëren.
  const [scenarios, setScenarios]                   = useState<Scenario[]>([])
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null)
  const [calcTick, setCalcTick]                     = useState(0)
  useEffect(() => {
    setScenarios(projectId ? getScenarios(projectId) : [])
  }, [projectId, toonCalculatie, calcTick])

  const handleScenariosGewijzigd = (nieuwId?: string) => {
    setCalcTick(t => t + 1)
    if (nieuwId) { setSelectedScenarioId(nieuwId); setToonCalculatie(true) }
  }
  // In de Opdracht-fase is reviseren niet toegestaan (Bouw7 is dan leidend);
  // de Reviseren-knop/optie wordt hier bewust weggelaten.

  async function aanmaken() {
    setBezig(true)
    const r = await koppelCalculatieProject(dossierId)
    setBezig(false)
    if (!r.ok) { toast.error(r.error); return }
    // localStorage-mapping van de calc-module bijwerken zodat de calculatie-omgeving het project kent.
    slaAanvraagProjectIdOp(dossierId, r.projectId)
    toast.success('Calculatie aangemaakt')
    router.refresh()
  }

  async function handleDelete() {
    if (!confirm('Alle calculaties en offertes verwijderen? Dit kan niet ongedaan worden.')) return
    setDeleteInProgress(true)
    const result = await deleteCalculatieVanDossier(dossierId)
    setDeleteInProgress(false)
    if (!result.ok) {
      toast.error(result.error || 'Verwijderen mislukt')
      return
    }
    toast.success('Calculatie verwijderd')
    router.refresh()
  }

  // Inline offerte-detail (bekijken/goedkeuren/verzenden) binnen het dossier.
  if (offerteId) {
    return (
      <div className="px-8 py-6">
        <OfferteDetail
          quoteId={offerteId}
          dossierId={dossierId}
          onTerug={() => setOfferteId(null)}
        />
      </div>
    )
  }

  // Volledige calculatie-omgeving, met terugknop naar het overzicht.
  if (toonCalculatie && projectId) {
    return (
      <div>
        <div className="px-8 pt-4">
          <Button variant="ghost" onClick={() => { setToonCalculatie(false); setSelectedScenarioId(null) }}>
            <ArrowLeft className="h-3.5 w-3.5" />
            Terug naar overzicht
          </Button>
        </div>
        <CalculatieHoofdscherm
          projectId={projectId}
          projectNaam={naam}
          projectNummer={nummer}
          toonProjectDetail
          readOnly={readOnly}
          scenarioId={selectedScenarioId ?? undefined}
          dossierContext={{ dossierId, clientNaam }}
          onScenariosGewijzigd={handleScenariosGewijzigd}
          magReviseren={false}
        />
      </div>
    )
  }

  // Geen calculatieproject → aanmaken.
  if (!projectId) {
    return (
      <div className="px-8 py-7 space-y-5">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <span>Calculaties</span>
              {!readOnly && (
                <Button variant="primary" onClick={aanmaken} disabled={bezig}>
                  <Calculator className="h-3.5 w-3.5" />
                  {bezig ? 'Bezig…' : 'Calculatie aanmaken'}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardBody style={{ padding: 0 }}>
            <div className="px-4 py-8 text-center">
              <div className="text-[14px] font-semibold text-neutral-800">Nog geen calculatie gekoppeld</div>
              <div className="mx-auto mt-1.5 max-w-[380px] text-[12.5px] text-neutral-500">
                Dit dossier heeft nog geen calculatieproject. Maak er één aan om calculaties,
                offertes en meerwerk-calculaties aan dit dossier te koppelen.
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    )
  }

  // Overzicht van alle calculaties + offertes.
  return (
    <CalculatiesTabel
      projectId={projectId}
      scenarios={scenarios}
      rijen={rijen}
      tick={calcTick}
      readOnly={readOnly}
      onOpenCalculatie={(sid) => { setSelectedScenarioId(sid); setToonCalculatie(true) }}
      onOpenOfferte={setOfferteId}
      headerExtra={
        <div className="flex gap-2">
          <Button variant="primary" size="sm" onClick={() => { setSelectedScenarioId(null); setToonCalculatie(true) }}>
            <Calculator className="h-3.5 w-3.5" />
            Calculatie openen
          </Button>
          {!readOnly && (
            <Button variant="ghost" size="sm" onClick={handleDelete} disabled={deleteInProgress} title="Verwijder alle calculaties en offertes">
              <Trash2 className="h-3.5 w-3.5" />
              {deleteInProgress ? 'Bezig…' : 'Verwijderen'}
            </Button>
          )}
        </div>
      }
    />
  )
}
