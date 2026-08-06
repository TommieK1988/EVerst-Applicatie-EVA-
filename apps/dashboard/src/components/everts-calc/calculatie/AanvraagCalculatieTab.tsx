'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import toast from 'react-hot-toast'
import { ArrowLeft } from 'lucide-react'
import CalculatieHoofdscherm from './CalculatieHoofdscherm'
import CalculatiesTabel from './CalculatiesTabel'
import OfferteDetail from './OfferteDetail'
import { maakProjectVanAanvraag } from '@/app/(platform)/everts-calc/actions/projecten'
import { koppelDossierAanProject } from '@/lib/dossiers/actions'
import { laadCalculatieSnapshot } from '@/app/(platform)/everts-calc/actions/sync'
import { getScenarios, hydrateCalculatie } from '@/lib/everts-calc/local-store'
import { reviseerCalculatie } from '@/lib/everts-calc/versie'
import { useDossierReadOnly } from '@/components/dossiers/DossierReadOnlyContext'
import { Button } from '@/components/ui'
import type { Scenario } from '@/lib/everts-calc/types'
import type { DossierQuoteRij } from '@/lib/everts-calc/services/quotes'

interface Props {
  aanvraagId: string
  naam: string
  nummer: string
  /** Klantnaam (opdrachtgever) — voor het aanmaken van offertes vanuit de calculatie. */
  clientNaam?: string | null
  /** Gekoppeld everts-calc project (dossiers.everts_calc_project_id) — de enige bron. */
  initieelProjectId?: string | null
  /** Aan het dossier gekoppelde offertes/calculaties (server-side opgehaald). */
  rijen?: DossierQuoteRij[]
}

export function AanvraagCalculatieTab({ aanvraagId, naam, nummer, clientNaam, initieelProjectId, rijen = [] }: Props) {
  const readOnly = useDossierReadOnly()
  const searchParams = useSearchParams()
  const [projectId, setProjectId] = useState<string | null>(null)
  const [isLaden, setIsLaden]     = useState(false)
  const [fout, setFout]           = useState<string | null>(null)
  // Inline geopende offerte (master-detail); ook via ?offerte={id} na aanmaken.
  const [offerteId, setOfferteId] = useState<string | null>(null)
  useEffect(() => {
    const q = searchParams.get('offerte')
    if (q) setOfferteId(q)
  }, [searchParams])

  // De koppeling dossier ⇄ calculatieproject komt uit de database
  // (dossiers.everts_calc_project_id) en nergens anders vandaan.
  useEffect(() => {
    setProjectId(initieelProjectId ?? null)
  }, [initieelProjectId])

  // Calculaties (scenario's) van dit project — meerdere ontstaan door kopiëren.
  const [scenarios, setScenarios]                   = useState<Scenario[]>([])
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null)
  const [toonCalculatie, setToonCalculatie]         = useState(false)
  const [calcTick, setCalcTick]                     = useState(0)
  const [gehydrateerd, setGehydrateerd]             = useState(false)

  // Hydrateer de gedeelde calculatie uit Supabase (één keer per project, vóór het
  // grid rendert). Zo is de calculatie op elk apparaat/elke gebruiker zichtbaar —
  // dezelfde fix als bij de werkbegroting. Draait bewust NIET op calcTick, anders
  // zou een lokaal net-gekopieerde (nog niet opgeslagen) calculatie overschreven worden.
  useEffect(() => {
    let actief = true
    setGehydrateerd(false)
    if (!projectId) return
    ;(async () => {
      try {
        const snap = await laadCalculatieSnapshot(projectId)
        if (actief && snap) hydrateCalculatie(projectId, snap)
      } catch { /* val terug op lokaal */ }
      finally { if (actief) setGehydrateerd(true) }
    })()
    return () => { actief = false }
  }, [projectId])

  // Lokale scenario's lezen — na hydratie en na lokale wijzigingen (reviseren e.d.).
  useEffect(() => {
    if (!projectId || !gehydrateerd) { setScenarios([]); return }
    setScenarios(getScenarios(projectId))
  }, [projectId, gehydrateerd, calcTick])

  // Verse aanvraag zonder calculatie → meteen de calculatie-omgeving in om de
  // begroting te bouwen (geen lege versie-kiezer). Zodra er ≥1 versie is landt de
  // tab op de versie-kiezer.
  useEffect(() => {
    if (projectId && gehydrateerd && scenarios.length === 0) setToonCalculatie(true)
  }, [projectId, gehydrateerd, scenarios.length])

  const handleScenariosGewijzigd = (nieuwId?: string) => {
    setCalcTick(t => t + 1)
    if (nieuwId) { setSelectedScenarioId(nieuwId); setToonCalculatie(true) }
  }
  const handleReviseer = async (sid: string) => {
    if (!projectId) return
    const nieuw = await reviseerCalculatie(projectId, sid)
    if (!nieuw) { toast.error('Reviseren mislukt'); return }
    toast.success('Nieuwe versie aangemaakt')
    handleScenariosGewijzigd(nieuw.id)
  }

  async function handleKoppelen() {
    setIsLaden(true)
    setFout(null)
    try {
      const { id } = await maakProjectVanAanvraag(naam, '')
      // Koppeling vastleggen in de database; die is leidend voor elk apparaat.
      const r = await koppelDossierAanProject(aanvraagId, id)
      if (!r.ok) throw new Error('Koppelen van de calculatie aan het dossier is mislukt.')
      // Idempotent: als het dossier al gekoppeld was, wint dat bestaande project.
      setProjectId(r.projectId ?? id)
    } catch (err) {
      setFout(err instanceof Error ? err.message : 'Fout bij aanmaken')
    } finally {
      setIsLaden(false)
    }
  }

  // Inline offerte-detail (bekijken/goedkeuren/verzenden) binnen het dossier.
  if (offerteId) {
    return (
      <div style={{ padding: '12px 32px' }}>
        <OfferteDetail
          quoteId={offerteId}
          dossierId={aanvraagId}
          onTerug={() => setOfferteId(null)}
        />
      </div>
    )
  }

  if (!projectId) {
    return (
      <div style={{
        padding: '56px 40px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
      }}>
        <div style={{ fontSize: 32, opacity: 0.25 }}>⚡</div>
        <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--fg)', margin: 0 }}>
          Calculatie koppelen aan overzicht
        </p>
        <p style={{ fontSize: 13, color: 'var(--fg-muted)', textAlign: 'center', maxWidth: 320, margin: 0, lineHeight: 1.6 }}>
          {readOnly
            ? 'Deze aanvraag heeft geen calculatie in het EvertsCalc-overzicht. Het dossier is afgesloten en alleen-lezen.'
            : 'Deze aanvraag heeft nog geen calculatie in het EvertsCalc-overzicht. Klik hieronder om het eenmalig aan te maken.'}
        </p>
        {!readOnly && (
          <button
            onClick={handleKoppelen}
            disabled={isLaden}
            style={{
              marginTop: 4,
              padding: '9px 24px', borderRadius: 8, border: 'none',
              background: 'var(--accent)', color: 'white',
              fontSize: 13, fontWeight: 700,
              cursor: isLaden ? 'not-allowed' : 'pointer',
              opacity: isLaden ? 0.6 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            {isLaden ? 'Bezig…' : 'Calculatie aanmaken in overzicht'}
          </button>
        )}
        {fout && (
          <p style={{ fontSize: 12, color: 'var(--color-red, #dc2626)', margin: 0 }}>{fout}</p>
        )}
      </div>
    )
  }

  // Wacht tot de gedeelde calculatie uit Supabase gehydrateerd is, zodat het grid
  // niet met lege/oude cache flitst voordat de server-versie geladen is.
  if (!gehydrateerd) {
    return (
      <div style={{ padding: '56px 40px', display: 'flex', justifyContent: 'center' }}>
        <p style={{ fontSize: 13, color: 'var(--fg-muted)', margin: 0 }}>Calculatie laden…</p>
      </div>
    )
  }

  // Landt op de versie-kiezer zodra er ≥1 calculatie is en de omgeving niet expliciet
  // geopend is. Een verse aanvraag (0 versies) gaat via het effect direct de editor in.
  if (scenarios.length > 0 && !toonCalculatie) {
    return (
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
    )
  }

  // Een gekozen (of nieuwe) calculatie → de calculatie-omgeving.
  return (
    <div>
      <div className="px-8 pt-4">
        <Button variant="ghost" onClick={() => { setToonCalculatie(false); setSelectedScenarioId(null) }}>
          <ArrowLeft className="h-3.5 w-3.5" />
          Terug naar versies
        </Button>
      </div>
      <CalculatieHoofdscherm
        projectId={projectId}
        projectNaam={naam}
        projectNummer={nummer}
        toonProjectDetail
        readOnly={readOnly}
        scenarioId={selectedScenarioId ?? undefined}
        dossierContext={{ dossierId: aanvraagId, clientNaam }}
        onScenariosGewijzigd={handleScenariosGewijzigd}
      />
    </div>
  )
}
