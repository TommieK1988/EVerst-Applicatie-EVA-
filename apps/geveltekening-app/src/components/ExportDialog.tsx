'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import type { Facade, FacadeDrawing, FacadeElement } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  exportSingleFacadePdf,
  exportOverviewPdf,
  NOMINAL_SCALES,
  type NominalScale,
} from '@/lib/pdf/exportFacadePdf'
import { X, FileDown, Loader2 } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
  currentFacade: Facade
  currentElements: FacadeElement[]
  currentDrawing: FacadeDrawing
  allFacades?: Facade[]
  allElementsByFacade?: Record<string, FacadeElement[]>
  addressLine?: string
  addressSlug?: string
  pandId?: string
  bouwjaar?: number
}

type Mode = 'single' | 'overview'
type ScaleChoice = 'auto' | NominalScale

export function ExportDialog({
  open,
  onClose,
  currentFacade,
  currentElements,
  currentDrawing,
  allFacades,
  allElementsByFacade,
  addressLine,
  addressSlug,
  pandId,
  bouwjaar,
}: Props) {
  const [mode, setMode] = useState<Mode>('single')
  const [scale, setScale] = useState<ScaleChoice>('auto')
  const [showTitleblock, setShowTitleblock] = useState(true)
  const [showLegenda, setShowLegenda] = useState(true)
  const [showPeilmaat, setShowPeilmaat] = useState(true)
  const [showNorthArrow, setShowNorthArrow] = useState(true)
  const [bladnummer, setBladnummer] = useState('01')
  const [tekenaar, setTekenaar] = useState('Everts')
  const [projectnummer, setProjectnummer] = useState('—')
  const [exporting, setExporting] = useState(false)

  if (!open) return null

  const overviewAvailable = (allFacades?.length ?? 0) > 1

  async function handleExport() {
    setExporting(true)
    try {
      const options = {
        scale,
        showTitleblock,
        showLegenda,
        showPeilmaat,
        showNorthArrow,
        bladnummer,
        tekenaar,
        projectnummer,
        totaalBladen: mode === 'overview' ? 1 : (allFacades?.length ?? 1),
      }
      const building = { addressLine, addressSlug, pandId, bouwjaar }

      if (mode === 'single') {
        exportSingleFacadePdf(
          {
            facade: currentFacade,
            widthMeters: currentDrawing.widthMeters,
            heightMeters: currentDrawing.heightMeters,
            elements: currentElements,
          },
          building,
          options
        )
      } else {
        const facades = (allFacades ?? [currentFacade]).map((f) => ({
          facade: f,
          widthMeters: f.id === currentFacade.id ? currentDrawing.widthMeters : f.widthMeters,
          heightMeters: f.id === currentFacade.id ? currentDrawing.heightMeters : f.estimatedHeightMeters,
          elements:
            f.id === currentFacade.id
              ? currentElements
              : (allElementsByFacade?.[f.id] ?? []),
        }))
        exportOverviewPdf(facades, building, options)
      }
      toast.success('PDF geëxporteerd')
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'PDF-export mislukt'
      toast.error(msg)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="text-base font-semibold text-slate-800">PDF exporteren</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-500 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-4 text-sm">
          <div className="space-y-2">
            <Label className="text-xs">Layout</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode('single')}
                className={`rounded-md border px-3 py-2 text-left text-xs ${
                  mode === 'single' ? 'border-everts bg-everts/5 font-medium' : 'hover:bg-slate-50'
                }`}
              >
                Per gevel (A3)
                <div className="mt-0.5 text-[10px] text-muted-foreground">Huidige gevel vol formaat</div>
              </button>
              <button
                type="button"
                onClick={() => setMode('overview')}
                disabled={!overviewAvailable}
                className={`rounded-md border px-3 py-2 text-left text-xs ${
                  mode === 'overview' ? 'border-everts bg-everts/5 font-medium' : 'hover:bg-slate-50'
                } ${!overviewAvailable ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                Overzichtsblad
                <div className="mt-0.5 text-[10px] text-muted-foreground">
                  {overviewAvailable
                    ? `${allFacades?.length} gevels naast elkaar`
                    : 'Vereist ≥2 gevels'}
                </div>
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Schaal</Label>
            <select
              value={String(scale)}
              onChange={(e) => {
                const v = e.target.value
                setScale(v === 'auto' ? 'auto' : (parseInt(v, 10) as NominalScale))
              }}
              className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="auto">Auto (kies grootste passende schaal)</option>
              {NOMINAL_SCALES.map((s) => (
                <option key={s} value={s}>1:{s}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Opties</Label>
            <div className="space-y-1 text-xs">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={showTitleblock} onChange={(e) => setShowTitleblock(e.target.checked)} />
                Titelblok rechtsonder
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={showLegenda} onChange={(e) => setShowLegenda(e.target.checked)} />
                Legenda + schaalbalk linksonder
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={showPeilmaat} onChange={(e) => setShowPeilmaat(e.target.checked)} />
                Peilmaat-ladder
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={showNorthArrow} onChange={(e) => setShowNorthArrow(e.target.checked)} />
                Noordpijl rechtsboven
              </label>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Bladnr</Label>
              <Input value={bladnummer} onChange={(e) => setBladnummer(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Tekenaar</Label>
              <Input value={tekenaar} onChange={(e) => setTekenaar(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Projectnr</Label>
              <Input value={projectnummer} onChange={(e) => setProjectnummer(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
          <Button variant="ghost" onClick={onClose}>Annuleren</Button>
          <Button onClick={handleExport} disabled={exporting}>
            {exporting ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Genereren...</>
            ) : (
              <><FileDown className="mr-2 h-4 w-4" />PDF downloaden</>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
