'use client'

import { useState, useEffect, useMemo } from 'react'
import { Search, X, BookOpen, CheckSquare, Square, Plus } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  slaCalculatieregelOp, slaComponentregelOp, getCalculatieregels, getScenario,
} from '@/lib/everts-calc/local-store'
import { useInstellingen } from '@/lib/everts-calc/use-instellingen'
import { formatEuro } from '@/lib/everts-calc/calculations'
import { nieuweId } from '@/lib/everts-calc/utils'
import type { Calculatieregel, Componentregel, Eenheid } from '@/lib/everts-calc/types'
import type { BibliotheekItemVereenvoudigd } from '@/lib/everts-calc/types'
import { haalBibliotheekItemsOp } from '@/app/(platform)/everts-calc/actions/bibliotheek'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'

interface Props {
  open: boolean
  onClose: () => void
  elementId: string      // groep_id
  scenarioId: string
  onToegevoegd: () => void
  bibliotheekItems?: BibliotheekItemVereenvoudigd[]
}

export default function ActiviteitToevoegenModal({
  open, onClose, elementId, scenarioId, onToegevoegd, bibliotheekItems = [],
}: Props) {
  const [zoek, setZoek]         = useState('')
  const [categorie, setCategorie] = useState('')
  const [gefocust, setGefocust]   = useState<BibliotheekItemVereenvoudigd | null>(null)

  // Multiselect: set van geselecteerde IDs + hoeveelheid per ID
  const [selectie, setSelectie]         = useState<Set<string>>(new Set())
  const [hoeveelheden, setHoeveelheden] = useState<Record<string, number>>({})

  // Vers geladen items (overschrijft de prop zodra geladen)
  const [items, setItems] = useState<BibliotheekItemVereenvoudigd[]>(bibliotheekItems)
  const [laadt, setLaadt] = useState(false)

  useEffect(() => {
    if (open) {
      setZoek(''); setCategorie(''); setGefocust(null)
      setSelectie(new Set()); setHoeveelheden({})
      // Haal altijd verse items op bij openen modal
      setLaadt(true)
      haalBibliotheekItemsOp()
        .then(setItems)
        .catch(() => { /* houd bestaande items */ })
        .finally(() => setLaadt(false))
    }
  }, [open])

  // Categorieën uit Instellingen (zelfde als op bibliotheek- en receptenpagina)
  const inst = useInstellingen()
  const categorieen = useMemo(
    () => inst.categorieen ?? ['Schilderwerk', 'Timmerwerk', 'Metselwerk', 'Dakwerk', 'Voegwerk', 'Overig'],
    [inst],
  )

  const gefilterd = items.filter(b => {
    if (categorie && b.onderdeel !== categorie) return false
    if (zoek) {
      const q = zoek.toLowerCase()
      return b.full_name.toLowerCase().includes(q) || b.item_code.toLowerCase().includes(q)
    }
    return true
  })

  const toggleSelecteer = (item: BibliotheekItemVereenvoudigd) => {
    setGefocust(item)
    setSelectie(prev => {
      const nieuw = new Set(prev)
      if (nieuw.has(item.id)) { nieuw.delete(item.id) }
      else {
        nieuw.add(item.id)
        if (!hoeveelheden[item.id]) {
          setHoeveelheden(h => ({ ...h, [item.id]: 1 }))
        }
      }
      return nieuw
    })
  }

  const setHoeveelheid = (id: string, val: number) => {
    setHoeveelheden(prev => ({ ...prev, [id]: val }))
  }

  // Items die echt toegevoegd worden: selectie als die >0 is, anders alleen gefocust
  const teToevoegen: BibliotheekItemVereenvoudigd[] =
    selectie.size > 0
      ? items.filter(i => selectie.has(i.id))
      : gefocust ? [gefocust] : []

  const handleToevoegen = () => {
    if (teToevoegen.length === 0) {
      toast.error('Selecteer eerst een recept in de lijst')
      return
    }

    try {
    const bestaandeVolgorde = getCalculatieregels(elementId).length

    teToevoegen.forEach((item, idx) => {
      const hoeveelheid = hoeveelheden[item.id] ?? 1
      const regelId = nieuweId()

      const btw_pct_default = getScenario(scenarioId)?.btw_pct_default
      const regel: Calculatieregel = {
        id: regelId,
        groep_id: elementId,
        omschrijving: item.full_name,
        werkomschrijving: item.description ?? undefined,
        hoeveelheid,
        eenheid: (item.default_unit || 'st') as Eenheid,
        volgorde: bestaandeVolgorde + idx + 1,
        btw_pct: btw_pct_default,
      }
      slaCalculatieregelOp(regel)

      // Arbeidsnormen
      item.labor_norms.forEach(n => {
        const comp: Componentregel = {
          id: nieuweId(),
          calculatieregel_id: regelId,
          type: 'arbeid',
          norm_hoeveelheid: n.hours_per_unit,
          tarief: n.hour_rate,
          eenheid: 'uur' as Eenheid,
        }
        slaComponentregelOp(comp)
      })

      // Materiaalnormen + onderaanneming
      item.material_norms.forEach(n => {
        const comp: Componentregel = {
          id: nieuweId(),
          calculatieregel_id: regelId,
          type: n.norm_type === 'onderaanneming' ? 'onderaanneming' : 'materieel',
          norm_hoeveelheid: n.quantity_per_unit,
          tarief: n.unit_price,
          eenheid: (n.unit || 'st') as Eenheid,
          omschrijving: n.material_name ?? undefined,
        }
        slaComponentregelOp(comp)
      })
    })

    const n = teToevoegen.length
    toast.success(n === 1 ? `Recept toegevoegd aan calculatie` : `${n} recepten toegevoegd aan calculatie`)
    onToegevoegd()
    } catch (err) {
      toast.error(`Fout bij toevoegen: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const aantalLabel = teToevoegen.length > 1 ? `${teToevoegen.length} recepten toevoegen` : 'Toevoegen aan calculatie'

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent size="lg" className="flex flex-col p-0">

        {/* Header */}
        <DialogHeader className="px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-everts" />
            <DialogTitle className="font-semibold text-slate-800">
              Recept uit bibliotheek
            </DialogTitle>
            {selectie.size > 0 && (
              <span className="ml-1 px-2 py-0.5 rounded-full bg-everts text-white text-xs font-semibold">
                {selectie.size} geselecteerd
              </span>
            )}
          </div>
        </DialogHeader>

          <div className="flex flex-1 overflow-hidden">

            {/* Links: zoeken + lijst */}
            <div className="flex flex-col w-1/2 border-r border-slate-200">
              {/* Zoek + categorie filter */}
              <div className="p-3 border-b border-slate-100 space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input
                    autoFocus
                    type="text"
                    value={zoek}
                    onChange={e => setZoek(e.target.value)}
                    placeholder="Zoeken in recepten..."
                    className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts"
                  />
                </div>
                <div className="flex gap-1 flex-wrap">
                  <button
                    onClick={() => setCategorie('')}
                    className={`px-2 py-1 text-xs rounded-full border transition-colors ${
                      categorie === '' ? 'bg-everts text-white border-everts' : 'border-slate-200 text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    Alle
                  </button>
                  {categorieen.map(c => (
                    <button key={c} onClick={() => setCategorie(categorie === c ? '' : c)}
                      className={`px-2 py-1 text-xs rounded-full border transition-colors ${
                        categorie === c ? 'bg-everts text-white border-everts' : 'border-slate-200 text-slate-500 hover:border-slate-300'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              {/* Item lijst */}
              <div className="flex-1 overflow-y-auto">
                {laadt && items.length === 0 && (
                  <div className="flex items-center justify-center py-8 gap-2 text-sm text-slate-400">
                    <Spinner size="sm" /> Recepten laden...
                  </div>
                )}
                {gefilterd.map(item => {
                  const isGesel = selectie.has(item.id)
                  const isFocus = gefocust?.id === item.id
                  return (
                    <div
                      key={item.id}
                      onClick={() => toggleSelecteer(item)}
                      className={`w-full flex items-center gap-2 px-3 py-2.5 text-left cursor-pointer hover:bg-slate-50 transition-colors border-b border-slate-50 select-none ${
                        isGesel ? 'bg-everts-50 border-l-2 border-l-everts' :
                        isFocus ? 'bg-slate-50' : ''
                      }`}
                    >
                      {isGesel
                        ? <CheckSquare className="w-4 h-4 text-everts flex-shrink-0" />
                        : <Square className="w-4 h-4 text-slate-300 flex-shrink-0" />
                      }
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-700 truncate">{item.full_name}</div>
                        <div className="text-xs text-slate-400">{item.item_code} · {item.default_unit}</div>
                      </div>
                    </div>
                  )
                })}
                {gefilterd.length === 0 && (
                  <div className="px-4 py-8 text-center text-sm text-slate-400">
                    {laadt ? 'Laden...' : items.length === 0 ? 'Bibliotheek is leeg' : 'Geen recepten gevonden'}
                  </div>
                )}
              </div>
            </div>

            {/* Rechts: detail of selectie-overzicht */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {selectie.size > 1 ? (
                /* Meerdere geselecteerd: toon overzicht met hoeveelheid per item */
                <>
                  <div className="px-4 pt-4 pb-2 text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Geselecteerde recepten
                  </div>
                  <div className="flex-1 overflow-y-auto px-4 space-y-2 pb-2">
                    {items.filter(i => selectie.has(i.id)).map(item => (
                      <div key={item.id} className="flex items-center gap-2 py-2 border-b border-slate-100">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-700 truncate">{item.full_name}</div>
                          <div className="text-xs text-slate-400">{item.item_code}</div>
                        </div>
                        <input
                          type="number" step="0.01" min="0.01"
                          value={hoeveelheden[item.id] ?? 1}
                          onChange={e => setHoeveelheid(item.id, parseFloat(e.target.value) || 1)}
                          onClick={e => e.stopPropagation()}
                          className="w-20 px-2 py-1 border border-slate-300 rounded text-sm text-right  focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts"
                        />
                        <span className="text-xs text-slate-400 w-6 flex-shrink-0">{item.default_unit}</span>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={e => { e.stopPropagation(); setSelectie(s => { const n = new Set(s); n.delete(item.id); return n }) }}
                          className="text-slate-300 hover:text-red-400"
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </>
              ) : gefocust ? (
                /* Enkel item gefocust: toon normen detail */
                <div className="flex-1 overflow-y-auto p-4">
                  <h3 className="font-semibold text-slate-800 mb-1">{gefocust.full_name}</h3>
                  <p className="text-xs text-slate-400 mb-4">{gefocust.item_code} · {gefocust.default_unit}</p>

                  <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
                    Normen per {gefocust.default_unit}
                  </div>
                  <div className="space-y-1">
                    {gefocust.labor_norms.map((n, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs py-1.5 border-b border-slate-50">
                        <span className="px-1.5 py-0.5 rounded text-xs font-medium flex-shrink-0 bg-blue-50 text-blue-700">A</span>
                        <span className="flex-1 text-slate-700">Arbeid</span>
                        <span className="text-slate-500 ">{n.hours_per_unit} u</span>
                        <span className="text-slate-500 ">{formatEuro(n.hour_rate)}/u</span>
                        <span className="text-blue-700  font-medium">{formatEuro(n.cost_per_unit)}</span>
                      </div>
                    ))}
                    {gefocust.material_norms.map((n, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs py-1.5 border-b border-slate-50">
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium flex-shrink-0 ${
                          n.norm_type === 'onderaanneming' ? 'bg-purple-50 text-purple-700' : 'bg-amber-50 text-amber-700'
                        }`}>
                          {n.norm_type === 'onderaanneming' ? 'OA' : 'M'}
                        </span>
                        <span className="flex-1 text-slate-700 truncate">{n.material_name ?? 'Materiaal'}</span>
                        <span className="text-slate-500 ">{n.quantity_per_unit} {n.unit}</span>
                        <span className={` font-medium ${n.norm_type === 'onderaanneming' ? 'text-purple-700' : 'text-amber-700'}`}>
                          {formatEuro(n.cost_per_unit)}
                        </span>
                      </div>
                    ))}
                    {gefocust.labor_norms.length === 0 && gefocust.material_norms.length === 0 && (
                      <p className="text-xs text-slate-400 italic">Geen normen ingesteld</p>
                    )}
                  </div>

                  {/* Hoeveelheid voor dit item */}
                  <div className="mt-4 flex items-center gap-3">
                    <label className="text-sm text-slate-600 flex-shrink-0">Hoeveelheid:</label>
                    <input
                      type="number" step="0.01" min="0.01"
                      value={hoeveelheden[gefocust.id] ?? 1}
                      onChange={e => setHoeveelheid(gefocust.id, parseFloat(e.target.value) || 1)}
                      className="w-24 px-3 py-2 border border-slate-300 rounded-lg text-sm text-right  focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts"
                    />
                    <span className="text-sm text-slate-500">{gefocust.default_unit}</span>
                  </div>

                  {/* Kostprijs preview */}
                  {(gefocust.labor_norms.length > 0 || gefocust.material_norms.length > 0) && (
                    <div className="mt-2 flex items-center justify-between text-sm">
                      <span className="text-slate-500">Geschatte kostprijs:</span>
                      <span className="font-semibold text-everts-dark">
                        {formatEuro((
                          gefocust.labor_norms.reduce((s, n) => s + n.cost_per_unit, 0) +
                          gefocust.material_norms.reduce((s, n) => s + n.cost_per_unit, 0)
                        ) * (hoeveelheden[gefocust.id] ?? 1))}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <EmptyState
                    tone="neutral"
                    size="sm"
                    icon={<BookOpen className="w-5 h-5" />}
                    title="Selecteer een recept"
                    description="Meerdere aanvinken voor bulktoevoeging"
                  />
                </div>
              )}

              {/* Footer: toevoegen knop */}
              <DialogFooter className="border-t border-slate-200 bg-slate-50 flex-shrink-0">
                <Button
                  variant={teToevoegen.length > 0 ? 'primary' : 'secondary'}
                  size="lg"
                  className="w-full"
                  onClick={handleToevoegen}
                >
                  <Plus className="w-4 h-4" />
                  {aantalLabel}
                </Button>
              </DialogFooter>
            </div>
          </div>
        </DialogContent>
    </Dialog>
  )
}
