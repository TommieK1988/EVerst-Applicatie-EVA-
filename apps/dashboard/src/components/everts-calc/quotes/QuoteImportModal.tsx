'use client'

import { useState, useEffect } from 'react'
import { Check, ChevronRight, ChevronDown } from 'lucide-react'
import { importeerRegels } from '@/app/(platform)/everts-calc/actions/quotes'
import type { QuoteType } from '@/lib/everts-calc/types-quotes'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'

interface ImportRegel {
  groep_id: string
  groep_naam: string
  omschrijving: string
  werkomschrijving: string
  werkomschrijving_afbeeldingen?: string[]
  hoeveelheid: number
  eenheid: string
  eenheidsprijs: number
  kostprijs_pe: number
  uren_pe: number
  calculatieregel_id: string
  is_stelpost?: boolean
  btw_pct?: number | null
  schilderbehandeling_id?: string | null
  schilderbehandeling?: string | null
}

interface Groep {
  id: string
  naam: string
  regels: ImportRegel[]
}

interface Props {
  quoteId: string
  type: QuoteType
  projectId?: string | null
  onClose: () => void
}

export default function QuoteImportModal({ quoteId, type, projectId, onClose }: Props) {
  const [groepen, setGroepen] = useState<Groep[]>([])
  const [geselecteerd, setGeselecteerd] = useState<Set<string>>(new Set())
  const [openGroepen, setOpenGroepen] = useState<Set<string>>(new Set())
  const [sectiePerGroep, setSectiePerGroep] = useState(true)
  const [isPending, setIsPending] = useState(false)

  useEffect(() => {
    // Laad data vanuit localStorage (client-side only)
    async function laad() {
      const { getGroepen, getCalculatieregels, getComponentregels, getScenarios } = await import('@/lib/everts-calc/local-store')
      const { berekenCalculatieregel } = await import('@/lib/everts-calc/calculations')

      const alleScenarios = getScenarios()

      // Filter op actief scenario van dit project
      let actieveScenarioIds: Set<string> | null = null
      if (projectId) {
        const projectScenarios = alleScenarios.filter(s => s.project_id === projectId)
        const actief = projectScenarios.find(s => s.is_standaard) ?? projectScenarios[0]
        if (actief) {
          actieveScenarioIds = new Set([actief.id])
        }
      }

      const alleGroepen = getGroepen()
      const alleRegels = getCalculatieregels()
      const alleComps = getComponentregels()

      // Groepeer calculatieregels per groep
      const groepMap = new Map<string, Groep>()

      for (const gr of alleGroepen) {
        // Sla groepen over die niet bij het actieve scenario horen
        if (actieveScenarioIds && !actieveScenarioIds.has(gr.scenario_id)) continue
        const regelsBijGroep = alleRegels.filter(r => r.groep_id === gr.id)
        if (regelsBijGroep.length === 0) continue

        // Haal scenario op voor opslag
        const scenario = alleScenarios.find(s => s.id === gr.scenario_id)
        const opslag = scenario
          ? scenario.opslag_algemene_kosten + scenario.opslag_winst_risico + (scenario.opslag_overhead ?? 0)
          : 18 // fallback

        const importRegels: ImportRegel[] = regelsBijGroep.map(r => {
          const comps = alleComps.filter(c => c.calculatieregel_id === r.id)
          const berekend = berekenCalculatieregel(r, comps, r.opslag_pct ?? opslag)
          return {
            groep_id: gr.id,
            groep_naam: gr.naam,
            omschrijving: r.omschrijving,
            hoeveelheid: r.hoeveelheid,
            eenheid: r.eenheid,
            eenheidsprijs: +berekend.vp_pe.toFixed(2),
            kostprijs_pe: +berekend.kp_pe.toFixed(2),
            uren_pe: +berekend.uren_pe.toFixed(3),
            calculatieregel_id: r.id,
            werkomschrijving: r.werkomschrijving ?? '',
            werkomschrijving_afbeeldingen: r.werkomschrijving_afbeeldingen,
            is_stelpost: r.is_stelpost ?? false,
            // Zonder eigen keuze het standaardtarief van de calculatie (leeg → server pakt 21%).
            btw_pct: r.btw_pct ?? scenario?.btw_pct_default ?? null,
            // Alleen de koppeling; de tekst bevriest de server op dít moment.
            schilderbehandeling_id: r.schilderbehandeling_id ?? null,
            schilderbehandeling: r.schilderbehandeling ?? null,
          }
        })

        groepMap.set(gr.id, {
          id: gr.id,
          naam: gr.naam,
          regels: importRegels,
        })
      }

      const groepLijst = Array.from(groepMap.values())
      setGroepen(groepLijst)
      // Open de eerste groep standaard
      if (groepLijst.length > 0) {
        setOpenGroepen(new Set([groepLijst[0].id]))
      }
    }
    laad()
  }, [])

  function toggleGroep(groepId: string) {
    setOpenGroepen(prev => {
      const next = new Set(prev)
      if (next.has(groepId)) next.delete(groepId)
      else next.add(groepId)
      return next
    })
  }

  function toggleRegel(regelId: string) {
    setGeselecteerd(prev => {
      const next = new Set(prev)
      if (next.has(regelId)) next.delete(regelId)
      else next.add(regelId)
      return next
    })
  }

  function selecteerAlles() {
    const alle = groepen.flatMap(g => g.regels.map(r => r.calculatieregel_id))
    setGeselecteerd(new Set(alle))
  }

  function deselecteerAlles() {
    setGeselecteerd(new Set())
  }

  async function importeer() {
    const geselecteerdeRegels: ImportRegel[] = groepen
      .flatMap(g => g.regels)
      .filter(r => geselecteerd.has(r.calculatieregel_id))

    if (geselecteerdeRegels.length === 0) return

    setIsPending(true)
    try {
      await importeerRegels(
        quoteId,
        geselecteerdeRegels.map(r => ({
          groep_id: r.groep_id,
          groep_naam: r.groep_naam,
          omschrijving: r.omschrijving,
          hoeveelheid: r.hoeveelheid,
          eenheid: r.eenheid,
          eenheidsprijs: r.eenheidsprijs,
          kostprijs_pe: r.kostprijs_pe,
          uren_pe: r.uren_pe,
          calculatieregel_id: r.calculatieregel_id,
          opmerking: (() => {
            const tekst = r.werkomschrijving || ''
            const imgs = (r.werkomschrijving_afbeeldingen ?? []).map(src =>
              `<img src="${src}" style="max-width:200px;max-height:150px;object-fit:contain;margin:2px 4px 2px 0;vertical-align:top" />`
            ).join('')
            const combined = tekst + (imgs ? (tekst ? '\n' : '') + imgs : '')
            return combined || null
          })(),
          is_stelpost: r.is_stelpost ?? false,
          btw_pct: r.btw_pct ?? null,
          schilderbehandeling_id: r.schilderbehandeling_id ?? null,
          schilderbehandeling: r.schilderbehandeling ?? null,
        }))
      )
      onClose()
    } catch (e) {
      alert('Fout bij importeren: ' + String(e))
    } finally {
      setIsPending(false)
    }
  }

  const aantalGeselecteerd = geselecteerd.size
  const totaalRegels = groepen.flatMap(g => g.regels).length

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent size="lg">
        {/* Header */}
        <DialogHeader>
          <div>
            <DialogTitle>Importeer uit calculatie</DialogTitle>
            <DialogDescription>
              {totaalRegels} regels gevonden
              {aantalGeselecteerd > 0 && ` — ${aantalGeselecteerd} geselecteerd`}
            </DialogDescription>
          </div>
        </DialogHeader>

        {/* Toolbar */}
        <div className="flex items-center gap-3 px-6 py-2.5 border-b border-slate-100 bg-slate-50">
          <Button variant="ghost" size="sm" onClick={selecteerAlles} className="text-xs text-everts font-medium px-0 hover:bg-transparent hover:underline">Alles selecteren</Button>
          <span className="text-slate-300">|</span>
          <Button variant="ghost" size="sm" onClick={deselecteerAlles} className="text-xs text-slate-400 px-0 hover:bg-transparent hover:text-slate-600">Deselecteer</Button>
          <div className="ml-auto flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={sectiePerGroep}
                onChange={(e) => setSectiePerGroep(e.target.checked)}
                className="rounded border-slate-300 text-everts focus:ring-everts/30"
              />
              Sectie per groep aanmaken
            </label>
          </div>
        </div>

        {/* Content */}
        <DialogBody className="p-4 space-y-2">
          {groepen.length === 0 ? (
            <EmptyState
              tone="neutral"
              size="sm"
              title="Geen calculatieregels gevonden"
              description="Er zijn geen calculatieregels gevonden in de lokale opslag."
            />
          ) : (
            groepen.map((groep) => {
              const isOpen = openGroepen.has(groep.id)
              const alleGeselecteerd = groep.regels.every(r => geselecteerd.has(r.calculatieregel_id))
              const deelsGeselecteerd = groep.regels.some(r => geselecteerd.has(r.calculatieregel_id)) && !alleGeselecteerd

              return (
                <div key={groep.id} className="border border-slate-200 rounded-lg overflow-hidden">
                  {/* Groep header */}
                  <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 hover:bg-slate-100 transition-colors">
                    <input
                      type="checkbox"
                      checked={alleGeselecteerd}
                      ref={(el) => { if (el) el.indeterminate = deelsGeselecteerd }}
                      onChange={() => {
                        if (alleGeselecteerd) {
                          setGeselecteerd(prev => {
                            const next = new Set(prev)
                            groep.regels.forEach(r => next.delete(r.calculatieregel_id))
                            return next
                          })
                        } else {
                          setGeselecteerd(prev => {
                            const next = new Set(prev)
                            groep.regels.forEach(r => next.add(r.calculatieregel_id))
                            return next
                          })
                        }
                      }}
                      className="rounded border-slate-300 text-everts focus:ring-everts/30"
                    />
                    <button
                      onClick={() => toggleGroep(groep.id)}
                      className="flex items-center gap-2 flex-1 text-left text-sm font-medium text-slate-700"
                    >
                      {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                      {groep.naam}
                      <span className="text-xs text-slate-400 font-normal">({groep.regels.length})</span>
                    </button>
                  </div>

                  {/* Regels */}
                  {isOpen && (
                    <div className="divide-y divide-slate-50">
                      {groep.regels.map((regel) => {
                        const selected = geselecteerd.has(regel.calculatieregel_id)
                        return (
                          <label
                            key={regel.calculatieregel_id}
                            className={`flex items-center gap-3 px-4 py-2 cursor-pointer transition-colors ${
                              selected ? 'bg-everts/3' : 'hover:bg-slate-50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => toggleRegel(regel.calculatieregel_id)}
                              className="rounded border-slate-300 text-everts focus:ring-everts/30 flex-shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <span className="text-sm text-slate-700 truncate block">{regel.omschrijving}</span>
                              <span className="text-xs text-slate-400">
                                {regel.hoeveelheid} {regel.eenheid}
                                {regel.eenheidsprijs > 0 && ` · € ${regel.eenheidsprijs.toFixed(2)}/eenh`}
                              </span>
                            </div>
                            <span className="text-sm font-medium text-slate-600 flex-shrink-0">
                              € {(regel.hoeveelheid * regel.eenheidsprijs).toLocaleString('nl-NL', { minimumFractionDigits: 2 })}
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </DialogBody>

        {/* Footer */}
        <DialogFooter split>
          <Button variant="outline" size="md" onClick={onClose}>
            Annuleren
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={importeer}
            disabled={aantalGeselecteerd === 0}
            loading={isPending}
          >
            {!isPending && <Check className="w-4 h-4" />}
            {isPending ? 'Importeren…' : `${aantalGeselecteerd} regel${aantalGeselecteerd !== 1 ? 's' : ''} importeren`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
