'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeft, RefreshCw, Plus, FolderOpen, CheckCircle2, X } from 'lucide-react'
import {
  maakStandaardScenario, getGroepen,
  getMeetstaten, maakNieuweMeetstaat, slaMeetstaatOp,
  getMeetregelAggregaten, slaMeetregelAggregaatOp,
  slaCalculatieregelOp, getCalculatieregels,
  getComponentregels, slaComponentregelOp, verwijderComponentregel,
} from '@/lib/everts-calc/local-store'
import { nieuweId } from '@/lib/everts-calc/utils'
import type { Meetstaat, Groep, Calculatieregel } from '@/lib/everts-calc/types'
import { calculatieregelOmschrijving } from '@/lib/everts-calc/meetstaat-utils'
import GroepenboomPanel from './GroepenboomPanel'
import MeetregelGrid from './MeetregelGrid'
import MeetstaatOpenenModal from './MeetstaatOpenenModal'
import toast from 'react-hot-toast'
import { haalSchilderDropdownData, haalCombinaties } from '@/app/(platform)/everts-calc/actions/schilderwerk'
import type { SchilderCombinatie } from '@/lib/everts-calc/services/schilderwerk'

interface SchilderData {
  onderdelen: { id: string; naam: string; code: string | null }[]
  types: { id: string; onderdeel_id: string; naam: string; eenheid: string; formule: string | null; code: string | null }[]
  behandelingen: { id: string; naam: string; code: string | null }[]
  combinaties: { id: string; onderdeel_id: string; type_id: string; behandeling_id: string }[]
}

export default function MeetstaaatHoofdscherm({ projectId, projectNaam, onSluit, schilderData: schilderDataProp }: {
  projectId: string
  projectNaam?: string
  onSluit?: () => void
  schilderData?: SchilderData
}) {
  const [scenario, setScenario] = useState(() => maakStandaardScenario(projectId))
  const [meetstaat, setMeetstaat] = useState<Meetstaat | null>(null)
  const [groepen, setGroepen] = useState<Groep[]>([])
  const [schilderData, setSchilderData] = useState<SchilderData | undefined>(schilderDataProp)
  const [actiefGroepId, setActiefGroepId] = useState<string | null>(null)
  const [openenOpen, setOpenenOpen] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [wijzigingsTeller, setWijzigingsTeller] = useState(0)
  const onWijziging = useCallback(() => setWijzigingsTeller(n => n + 1), [])

  // Haal schilderdata op als die niet als prop is meegegeven (bijv. vanuit calculatie-overlay)
  useEffect(() => {
    if (schilderDataProp) return
    haalSchilderDropdownData()
      .then(data => setSchilderData(data))
      .catch(() => {/* geen schilder data beschikbaar */})
  }, [schilderDataProp])

  // Laad groepen
  useEffect(() => {
    if (!scenario) return
    const g = getGroepen(scenario.id)
    setGroepen(g)
    if (g.length > 0 && !actiefGroepId) setActiefGroepId(g[0].id)
  }, [scenario?.id])

  // Laad of maak meetstaat
  useEffect(() => {
    if (!scenario) return
    const bestaande = getMeetstaten(scenario.id)
    if (bestaande.length > 0) {
      // Neem de meest recent bewerkte
      const gesorteerd = [...bestaande].sort((a, b) =>
        b.aangepast_op.localeCompare(a.aangepast_op)
      )
      setMeetstaat(gesorteerd[0])
    }
  }, [scenario?.id])

  const handleVervers = useCallback(() => {
    // Herlaad groepen (volgorde kan gewijzigd zijn in calculatie)
    if (scenario) {
      const g = getGroepen(scenario.id)
      setGroepen(g)
    }
    // Herlaad schilder data (nieuwe behandelingen kunnen zijn toegevoegd)
    haalSchilderDropdownData()
      .then(data => setSchilderData(data))
      .catch(() => {})
  }, [scenario])

  const handleNieuweMeetstaat = useCallback(() => {
    if (!scenario) return
    const ms = maakNieuweMeetstaat(projectId, scenario.id)
    setMeetstaat(ms)
    toast.success(`Meetstaat ${ms.code} aangemaakt`)
  }, [scenario, projectId])

  const handleMeetstaatOpenen = useCallback((ms: Meetstaat) => {
    setMeetstaat(ms)
    setOpenenOpen(false)
  }, [])

  // Sync aggregaten naar calculatieregels + componentregels
  const handleSync = useCallback(async () => {
    if (!meetstaat || !scenario) return
    setIsSyncing(true)

    try {
      const aggregaten = getMeetregelAggregaten(meetstaat.id).filter(a => a.totaal_hoeveelheid > 0)
      const bestaandeRegels = getCalculatieregels()

      // Haal schilder combinaties op per uniek type_id (batch)
      const typeIds = Array.from(new Set(aggregaten.map(a => a.type_id).filter(Boolean))) as string[]
      const combinatiesPerType = new Map<string, SchilderCombinatie[]>()
      await Promise.all(typeIds.map(async (typeId) => {
        try {
          const combs = await haalCombinaties(typeId)
          combinatiesPerType.set(typeId, combs)
        } catch {
          // Schilder data niet beschikbaar voor dit type — ga door zonder normen
        }
      }))

      let aangemaakt = 0
      let bijgewerkt = 0

      for (const agg of aggregaten) {
        const omschrijving = calculatieregelOmschrijving(agg.onderdeel, agg.type, agg.behandeling)

        // Zoek bijpassende schilder combinatie via IDs
        const combinaties = agg.type_id ? (combinatiesPerType.get(agg.type_id) ?? []) : []
        const combinatie = agg.behandeling_id
          ? combinaties.find(c => c.behandeling_id === agg.behandeling_id)
          : combinaties.find(c => c.behandeling.naam.toLowerCase() === agg.behandeling.toLowerCase())

        let calculatieregelId: string

        if (agg.calculatieregel_id) {
          // Bijwerken bestaande calculatieregel
          const bestaand = bestaandeRegels.find(r => r.id === agg.calculatieregel_id)
          if (bestaand) {
            slaCalculatieregelOp({
              ...bestaand,
              omschrijving,
              hoeveelheid: agg.totaal_hoeveelheid,
              eenheid: agg.eenheid as Calculatieregel['eenheid'],
              meetstaat_aggregaat_id: agg.id,
            })
            calculatieregelId = bestaand.id
            bijgewerkt++
          } else {
            calculatieregelId = agg.calculatieregel_id
          }
        } else {
          // Nieuwe calculatieregel aanmaken
          const nieuweRegel: Calculatieregel = {
            id: nieuweId(),
            groep_id: agg.groep_id,
            omschrijving,
            hoeveelheid: agg.totaal_hoeveelheid,
            eenheid: agg.eenheid as Calculatieregel['eenheid'],
            volgorde: 0,
            opslag_pct: undefined,
            gemarkeerd: false,
            meetstaat_aggregaat_id: agg.id,
          }
          slaCalculatieregelOp(nieuweRegel)
          slaMeetregelAggregaatOp({
            ...agg,
            calculatieregel_id: nieuweRegel.id,
            is_gesynchroniseerd: true,
          })
          calculatieregelId = nieuweRegel.id
          aangemaakt++
        }

        // Maak componentregels aan vanuit schilder normen (vervangt bestaande)
        if (combinatie) {
          // Verwijder bestaande componentregels voor deze calculatieregel
          getComponentregels(calculatieregelId).forEach(c => verwijderComponentregel(c.id))

          // Arbeid normen
          combinatie.arbeid_normen.forEach(n => {
            if (n.cost_per_unit > 0) {
              slaComponentregelOp({
                id: nieuweId(),
                calculatieregel_id: calculatieregelId,
                type: 'arbeid',
                norm_hoeveelheid: n.minutes_per_unit / 60,
                tarief: n.hour_rate,
                omschrijving: n.omschrijving ?? undefined,
              })
            }
          })

          // Materiaal normen (niet-onderaanneming)
          combinatie.materiaal_normen
            .filter(n => n.norm_type !== 'onderaanneming')
            .forEach(n => {
              if (n.cost_per_unit > 0) {
                slaComponentregelOp({
                  id: nieuweId(),
                  calculatieregel_id: calculatieregelId,
                  type: 'materieel',
                  norm_hoeveelheid: n.quantity_per_unit,
                  tarief: n.unit_price,
                  eenheid: (n.eenheid ?? undefined) as Calculatieregel['eenheid'] | undefined,
                  omschrijving: n.naam ?? undefined,
                })
              }
            })

          // Onderaanneming normen
          combinatie.materiaal_normen
            .filter(n => n.norm_type === 'onderaanneming')
            .forEach(n => {
              if (n.cost_per_unit > 0) {
                slaComponentregelOp({
                  id: nieuweId(),
                  calculatieregel_id: calculatieregelId,
                  type: 'onderaanneming',
                  norm_hoeveelheid: 1,
                  tarief: n.unit_price,
                  omschrijving: n.naam ?? undefined,
                })
              }
            })
        }
      }

      slaMeetstaatOp({ ...meetstaat, status: 'gesynchroniseerd' })
      setMeetstaat(prev => prev ? { ...prev, status: 'gesynchroniseerd' } : prev)
      toast.success(`Gesynchroniseerd: ${aangemaakt} nieuwe, ${bijgewerkt} bijgewerkte calculatieregels`)
    } catch (e) {
      toast.error('Synchronisatie mislukt')
    } finally {
      setIsSyncing(false)
    }
  }, [meetstaat, scenario])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const aggregaten = meetstaat ? getMeetregelAggregaten(meetstaat.id).filter(a => a.totaal_hoeveelheid > 0) : []
  const ongesyncCount = aggregaten.filter(a => !a.is_gesynchroniseerd).length
  void wijzigingsTeller // zorgt dat re-render triggered bij wijzigingen

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* ─── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 bg-white border-b border-slate-200 px-4 py-2.5 flex items-center gap-3">
        {onSluit ? (
          <button
            onClick={onSluit}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            title="Meetstaat sluiten"
          >
            <X className="w-4 h-4" />
          </button>
        ) : (
          <Link
            href="/aanvragen"
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-everts transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">{projectNaam ?? 'Aanvragen'}</span>
          </Link>
        )}

        <div className="h-5 w-px bg-slate-200" />

        {/* Meetstaat naam/code */}
        {meetstaat ? (
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-800">{meetstaat.naam}</span>
            <span className="text-xs  text-slate-400">{meetstaat.code}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded-full border ${
              meetstaat.status === 'gesynchroniseerd'
                ? 'bg-green-50 text-green-600 border-green-200'
                : meetstaat.status === 'definitief'
                ? 'bg-blue-50 text-blue-600 border-blue-200'
                : 'bg-amber-50 text-amber-600 border-amber-200'
            }`}>
              {meetstaat.status}
            </span>
          </div>
        ) : (
          <span className="text-sm text-slate-400 italic">Geen meetstaat actief</span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {/* Ververs bibliotheekdata */}
          <button
            onClick={handleVervers}
            title="Herlaad schilderbibliotheek en groepsindeling"
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>

          {/* Nieuwe meetstaat */}
          <button
            onClick={handleNieuweMeetstaat}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-slate-200
                       text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Nieuwe meetstaat</span>
          </button>

          {/* Meetstaat openen */}
          <button
            onClick={() => setOpenenOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-slate-200
                       text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Openen</span>
          </button>

          {/* Sync naar calculatie */}
          {meetstaat && (
            <button
              onClick={handleSync}
              disabled={isSyncing || ongesyncCount === 0}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                ongesyncCount > 0
                  ? 'bg-everts text-white hover:bg-everts/90'
                  : 'bg-slate-100 text-slate-400 cursor-default'
              }`}
            >
              {isSyncing
                ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                : <CheckCircle2 className="w-3.5 h-3.5" />
              }
              <span className="hidden sm:inline">Sync naar calculatie</span>
              {ongesyncCount > 0 && (
                <span className="bg-paper/20 text-white text-xs px-1.5 rounded-full">
                  {ongesyncCount}
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* ─── Hoofd content ───────────────────────────────────────────────── */}
      {!meetstaat ? (
        // Geen meetstaat: toon welkomscherm
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4 max-w-sm">
            <div className="w-16 h-16 bg-everts/10 rounded-2xl flex items-center justify-center mx-auto">
              <span className="text-3xl">📐</span>
            </div>
            <h2 className="text-lg font-semibold text-slate-800">Geen meetstaat actief</h2>
            <p className="text-sm text-slate-500">
              Maak een nieuwe meetstaat aan of open een bestaande om te beginnen.
            </p>
            <div className="flex gap-2 justify-center">
              <button
                onClick={handleNieuweMeetstaat}
                className="px-4 py-2 bg-everts text-white rounded-lg text-sm font-medium hover:bg-everts/90"
              >
                + Nieuwe meetstaat
              </button>
              <button
                onClick={() => setOpenenOpen(true)}
                className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm hover:bg-slate-50"
              >
                Openen
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden">
          {/* Groepenboom links */}
          <GroepenboomPanel
            groepen={groepen}
            actiefGroepId={actiefGroepId}
            meetstaatId={meetstaat.id}
            onGroepSelecteer={setActiefGroepId}
          />

          {/* Meetregel grid centraal */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {actiefGroepId ? (
              <MeetregelGrid
                meetstaatId={meetstaat.id}
                groepId={actiefGroepId}
                groepen={groepen}
                onWijziging={onWijziging}
                schilderData={schilderData}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
                Kies een groep links om meetregels in te voeren
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: meetstaat openen */}
      {openenOpen && (
        <MeetstaatOpenenModal
          scenarioId={scenario.id}
          onSelecteer={handleMeetstaatOpenen}
          onSluit={() => setOpenenOpen(false)}
        />
      )}
    </div>
  )
}
