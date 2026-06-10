'use client'

import { useState, useRef, useMemo } from 'react'
import toast from 'react-hot-toast'
import type {
  Facade,
  FacadeDrawing,
  FacadeElement,
  FacadeElementKind,
  OpeningType,
  MasonryPattern,
} from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FacadeDrawingCanvas } from './FacadeDrawingCanvas'
import { PerspectiveCorrector } from './PerspectiveCorrector'
import { ExportDialog } from './ExportDialog'
import { facadeToGevelCode, defaultsForKind } from '@/lib/facade-utils'
import {
  ArrowLeft,
  Upload,
  Sparkles,
  Loader2,
  Plus,
  Trash2,
  ImageIcon,
  Scan,
  Compass,
  FileDown,
} from 'lucide-react'

interface Props {
  facade: Facade
  onBack: () => void
  /** Pand-context voor titelblok-velden bij PDF export */
  addressLine?: string
  addressSlug?: string
  pandId?: string
  bouwjaar?: number
  /** Alle geselecteerde gevels (voor overzichts-PDF) */
  selectedFacades?: Facade[]
  /** Elementen per facadeId (voor overzichts-PDF) */
  elementsByFacadeId?: Record<string, FacadeElement[]>
  /** Callback bij wijziging van elementen — voor het bijhouden per-gevel in parent */
  onElementsChange?: (facadeId: string, elements: FacadeElement[]) => void
}

const KIND_OPTIONS: { value: FacadeElementKind; label: string }[] = [
  { value: 'window', label: 'Raam' },
  { value: 'door', label: 'Deur' },
  { value: 'frame', label: 'Kozijn' },
  { value: 'masonry', label: 'Metselwerk' },
  { value: 'fence', label: 'Hekwerk' },
  { value: 'canopy', label: 'Luifel' },
  { value: 'concrete-band', label: 'Betonband' },
  { value: 'lintel', label: 'Latei' },
  { value: 'gutter', label: 'Goot' },
  { value: 'roof-edge', label: 'Dakrand' },
  { value: 'chimney', label: 'Schoorsteen' },
  { value: 'other', label: 'Overig' },
]

const OPENING_TYPES: { value: OpeningType; label: string }[] = [
  { value: 'vast', label: 'Vast' },
  { value: 'draai-links', label: 'Draai links' },
  { value: 'draai-rechts', label: 'Draai rechts' },
  { value: 'draai-kiep-links', label: 'Draai-kiep links' },
  { value: 'draai-kiep-rechts', label: 'Draai-kiep rechts' },
  { value: 'kiep', label: 'Kiep' },
  { value: 'val', label: 'Val' },
  { value: 'schuif-links', label: 'Schuif links' },
  { value: 'schuif-rechts', label: 'Schuif rechts' },
]

const MASONRY_PATTERNS: { value: MasonryPattern; label: string }[] = [
  { value: 'halfsteens', label: 'Halfsteens' },
  { value: 'kettingverband', label: 'Kettingverband' },
  { value: 'wildverband', label: 'Wildverband' },
]

const QUICK_ADD: { kind: FacadeElementKind; label: string }[] = [
  { kind: 'window', label: 'Raam' },
  { kind: 'door', label: 'Deur' },
  { kind: 'frame', label: 'Kozijn' },
  { kind: 'masonry', label: 'Metselwerk' },
  { kind: 'fence', label: 'Hekwerk' },
  { kind: 'canopy', label: 'Luifel' },
  { kind: 'concrete-band', label: 'Betonband' },
  { kind: 'lintel', label: 'Latei' },
]

export function FacadeEditor({
  facade,
  onBack,
  addressLine,
  addressSlug,
  pandId,
  bouwjaar,
  selectedFacades,
  elementsByFacadeId,
  onElementsChange,
}: Props) {
  const [widthMeters, setWidthMeters] = useState(
    Math.round(facade.widthMeters * 100) / 100
  )
  const [heightMeters, setHeightMeters] = useState(
    Math.round(facade.estimatedHeightMeters * 100) / 100
  )
  const [imageBase64, setImageBase64] = useState<string | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [originalImageSrc, setOriginalImageSrc] = useState<string | null>(null)
  const [correctorOpen, setCorrectorOpen] = useState(false)
  const [rectified, setRectified] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [elements, setElementsState] = useState<FacadeElement[]>(
    () => elementsByFacadeId?.[facade.id] ?? []
  )
  const [notes, setNotes] = useState<string | null>(null)
  const [anchors, setAnchors] = useState<string | null>(null)
  const [grid, setGrid] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const gevelCode = facadeToGevelCode(facade)

  function setElements(next: FacadeElement[] | ((prev: FacadeElement[]) => FacadeElement[])) {
    setElementsState((prev) => {
      const resolved = typeof next === 'function' ? (next as (p: FacadeElement[]) => FacadeElement[])(prev) : next
      onElementsChange?.(facade.id, resolved)
      return resolved
    })
  }

  const drawing: FacadeDrawing = useMemo(
    () => ({
      facadeId: facade.id,
      widthMeters,
      heightMeters,
      elements,
    }),
    [facade.id, widthMeters, heightMeters, elements]
  )

  const selected = elements.find((el) => el.id === selectedId) ?? null

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Selecteer een afbeelding')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      setImagePreview(dataUrl)
      setOriginalImageSrc(dataUrl)
      const base64 = dataUrl.split(',')[1] ?? ''
      setImageBase64(base64)
      setRectified(false)
      setCorrectorOpen(true)
    }
    reader.readAsDataURL(file)
  }

  function handleRectified(dataUrl: string) {
    setImagePreview(dataUrl)
    const base64 = dataUrl.split(',')[1] ?? ''
    setImageBase64(base64)
    setRectified(true)
    setCorrectorOpen(false)
    toast.success('Beeld rechtgetrokken')
  }

  function resetToOriginal() {
    if (!originalImageSrc) return
    setImagePreview(originalImageSrc)
    const base64 = originalImageSrc.split(',')[1] ?? ''
    setImageBase64(base64)
    setRectified(false)
  }

  async function handleAnalyze() {
    if (!imageBase64) {
      toast.error('Upload eerst een foto')
      return
    }
    setAnalyzing(true)
    try {
      const res = await fetch('/api/vision/analyze-facade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: imageBase64,
          widthMeters,
          heightMeters,
          rectified,
          context: `${facade.label}, ${facade.orientation.compass}-gevel`,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'Analyse mislukt')
      }
      const data = await res.json()
      // Apply smart defaults voor elementen die geen openingType hebben
      const withDefaults: FacadeElement[] = (data.elements ?? []).map((el: FacadeElement) => ({
        ...defaultsForKind(el.kind),
        ...el,
      }))
      setElements(withDefaults)
      setNotes(data.notes ?? null)
      setAnchors(data.anchors ?? null)
      setGrid(data.grid ?? null)
      toast.success(`${withDefaults.length} elementen gedetecteerd`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Onbekende fout'
      toast.error(msg)
    } finally {
      setAnalyzing(false)
    }
  }

  function updateSelected(patch: Partial<FacadeElement>) {
    if (!selected) return
    setElements((prev) =>
      prev.map((el) => (el.id === selected.id ? { ...el, ...patch } : el))
    )
  }

  function deleteSelected() {
    if (!selected) return
    setElements((prev) => prev.filter((el) => el.id !== selected.id))
    setSelectedId(null)
  }

  function addElementOfKind(kind: FacadeElementKind) {
    const defaults = defaultsForKind(kind)
    const size = defaultSizeForKind(kind, widthMeters, heightMeters)
    const newEl: FacadeElement = {
      id: `manual-${Date.now()}`,
      kind,
      x: Math.max(0, widthMeters / 2 - size.w / 2),
      y: Math.max(0, heightMeters / 2 - size.h / 2),
      widthMeters: size.w,
      heightMeters: size.h,
      ...defaults,
    }
    setElements((prev) => [...prev, newEl])
    setSelectedId(newEl.id)
  }

  const isOpening = selected && (selected.kind === 'window' || selected.kind === 'door' || selected.kind === 'frame')

  return (
    <div className="flex flex-col xl:flex-row gap-4 xl:h-[calc(100vh-11rem)]">
      <div className="xl:w-[420px] flex-shrink-0 flex flex-col gap-3 overflow-y-auto xl:pr-1">
        <div className="rounded-lg border bg-white p-4 shadow-sm">
          <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2 mb-2">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Terug
          </Button>
          <h2 className="text-lg font-semibold text-slate-800">{facade.label}</h2>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
            <Compass className="h-3 w-3" />
            {facade.orientation.compass}-gevel ({Math.round(facade.orientation.azimuthDegrees)}°) — code {gevelCode}
          </div>
        </div>

        <Section title="Referentiematen">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="width" className="text-xs">Breedte (m)</Label>
              <Input
                id="width"
                type="number"
                step="0.01"
                min="1"
                value={widthMeters}
                onChange={(e) => setWidthMeters(parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="height" className="text-xs">Hoogte (m)</Label>
              <Input
                id="height"
                type="number"
                step="0.01"
                min="1"
                value={heightMeters}
                onChange={(e) => setHeightMeters(parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>
        </Section>

        <Section title="Gevelfoto">
          <div className="space-y-2">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => fileInputRef.current?.click()}
              type="button"
            >
              <Upload className="mr-2 h-4 w-4" />
              {imagePreview ? 'Andere foto kiezen' : 'Foto uploaden'}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />

            {imagePreview && !correctorOpen && (
              <div className="space-y-2">
                <div className="relative overflow-hidden rounded-md border bg-muted/30">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imagePreview}
                    alt="Gevel foto"
                    className="max-h-40 w-full object-contain"
                  />
                  {rectified && (
                    <span className="absolute right-2 top-2 rounded-md bg-everts px-2 py-0.5 text-xs font-medium text-white">
                      Rechtgetrokken
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => setCorrectorOpen(true)}>
                    <Scan className="mr-2 h-4 w-4" />
                    {rectified ? 'Opnieuw rechttrekken' : 'Perspectief corrigeren'}
                  </Button>
                  {rectified && (
                    <Button variant="ghost" size="sm" onClick={resetToOriginal}>
                      Terug naar origineel
                    </Button>
                  )}
                </div>
              </div>
            )}

            <Button
              onClick={handleAnalyze}
              disabled={!imageBase64 || analyzing || correctorOpen}
              className="w-full"
            >
              {analyzing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Analyseren...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Analyseer met Claude Vision
                </>
              )}
            </Button>
          </div>
        </Section>

        {(anchors || grid || notes) && (
          <Section title="Analyse-observaties">
            <div className="space-y-1.5 text-xs text-muted-foreground">
              {anchors && <p><span className="font-medium text-foreground">Anker:</span> {anchors}</p>}
              {grid && <p><span className="font-medium text-foreground">Rooster:</span> {grid}</p>}
              {notes && <p><span className="font-medium text-foreground">Observatie:</span> {notes}</p>}
            </div>
          </Section>
        )}

        <Section title="Laag toevoegen">
          <div className="grid grid-cols-2 gap-1.5">
            {QUICK_ADD.map((q) => (
              <Button
                key={q.kind}
                variant="outline"
                size="sm"
                onClick={() => addElementOfKind(q.kind)}
                className="justify-start text-xs"
              >
                <Plus className="mr-1 h-3 w-3" />
                {q.label}
              </Button>
            ))}
          </div>
        </Section>

        <Section title={`Elementen (${elements.length})`}>
          {elements.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-4 text-center text-xs text-muted-foreground">
              <ImageIcon className="h-6 w-6 opacity-40" />
              <span>Nog geen elementen. Upload een foto of voeg handmatig toe.</span>
            </div>
          ) : (
            <ul className="divide-y -mx-3 text-sm">
              {elements.map((el) => {
                const active = el.id === selectedId
                const label = KIND_OPTIONS.find((k) => k.value === el.kind)?.label ?? el.kind
                return (
                  <li key={el.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(el.id)}
                      className={`flex w-full items-center justify-between px-3 py-2 text-left transition-colors ${
                        active ? 'bg-everts/10' : 'hover:bg-slate-50'
                      }`}
                    >
                      <span>
                        <span className="font-medium">{label}</span>
                        {el.confidence !== undefined && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            {Math.round(el.confidence * 100)}%
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {(el.widthMeters * 100).toFixed(0)}×{(el.heightMeters * 100).toFixed(0)} cm
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </Section>

        {selected && (
          <Section
            title="Element bewerken"
            action={
              <Button variant="ghost" size="sm" onClick={deleteSelected} className="-mr-2">
                <Trash2 className="h-4 w-4" />
              </Button>
            }
          >
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="el-kind" className="text-xs">Type</Label>
                <select
                  id="el-kind"
                  value={selected.kind}
                  onChange={(e) => updateSelected({ kind: e.target.value as FacadeElementKind })}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  {KIND_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <LabelledInput label="x (m)" value={selected.x} onChange={(v) => updateSelected({ x: v })} />
                <LabelledInput label="y (m)" value={selected.y} onChange={(v) => updateSelected({ y: v })} />
                <LabelledInput label="breedte (m)" value={selected.widthMeters} onChange={(v) => updateSelected({ widthMeters: v })} />
                <LabelledInput label="hoogte (m)" value={selected.heightMeters} onChange={(v) => updateSelected({ heightMeters: v })} />
              </div>

              {isOpening && (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Draairichting</Label>
                    <select
                      value={selected.openingType ?? 'vast'}
                      onChange={(e) => updateSelected({ openingType: e.target.value as OpeningType })}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                    >
                      {OPENING_TYPES.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={selected.opensOutward ?? false}
                      onChange={(e) => updateSelected({ opensOutward: e.target.checked })}
                    />
                    Draait naar buiten (solide V, default = naar binnen)
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <LabelledInput
                      label="Paneelverd. H"
                      value={selected.paneelverdelingH ?? 0}
                      onChange={(v) => updateSelected({ paneelverdelingH: Math.max(0, Math.round(v)) })}
                      step="1"
                    />
                    <LabelledInput
                      label="Paneelverd. V"
                      value={selected.paneelverdelingV ?? 0}
                      onChange={(v) => updateSelected({ paneelverdelingV: Math.max(0, Math.round(v)) })}
                      step="1"
                    />
                  </div>
                </>
              )}

              {selected.kind === 'fence' && (
                <LabelledInput
                  label="Spijl h.o.h. (mm)"
                  value={selected.railingSpacing ?? 110}
                  onChange={(v) => updateSelected({ railingSpacing: Math.max(20, Math.round(v)) })}
                  step="10"
                />
              )}

              {selected.kind === 'masonry' && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Metselwerk-patroon</Label>
                  <select
                    value={selected.masonryPattern ?? 'halfsteens'}
                    onChange={(e) => updateSelected({ masonryPattern: e.target.value as MasonryPattern })}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  >
                    {MASONRY_PATTERNS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </Section>
        )}

        <Section title="Export">
          <Button
            variant="default"
            className="w-full"
            onClick={() => setExportOpen(true)}
            disabled={elements.length === 0}
          >
            <FileDown className="mr-2 h-4 w-4" />
            Exporteren naar PDF
          </Button>
        </Section>
      </div>

      <div className="flex-1 min-w-0">
        {correctorOpen && originalImageSrc ? (
          <div className="rounded-lg border bg-white shadow-sm">
            <PerspectiveCorrector
              imageSrc={originalImageSrc}
              widthMeters={widthMeters}
              heightMeters={heightMeters}
              onRectified={handleRectified}
              onCancel={() => setCorrectorOpen(false)}
            />
          </div>
        ) : (
          <div className="rounded-lg border bg-white p-4 shadow-sm h-full flex items-start justify-center">
            <div className="w-full max-w-5xl">
              <FacadeDrawingCanvas
                drawing={drawing}
                selectedElementId={selectedId}
                onSelectElement={setSelectedId}
                onChangeElement={(id, patch) =>
                  setElements((prev) => prev.map((el) => (el.id === id ? { ...el, ...patch } : el)))
                }
                pixelWidth={1200}
                gevelCode={gevelCode}
              />
            </div>
          </div>
        )}
      </div>

      {exportOpen && (
        <ExportDialog
          open={exportOpen}
          onClose={() => setExportOpen(false)}
          currentFacade={facade}
          currentElements={elements}
          currentDrawing={drawing}
          allFacades={selectedFacades}
          allElementsByFacade={elementsByFacadeId}
          addressLine={addressLine}
          addressSlug={addressSlug}
          pandId={pandId}
          bouwjaar={bouwjaar}
        />
      )}
    </div>
  )
}

function defaultSizeForKind(
  kind: FacadeElementKind,
  w: number,
  h: number
): { w: number; h: number } {
  switch (kind) {
    case 'window': return { w: 1.2, h: 1.4 }
    case 'door': return { w: 0.95, h: 2.1 }
    case 'frame': return { w: 1.2, h: 1.6 }
    case 'masonry': return { w: Math.min(4, w * 0.4), h: Math.min(3, h * 0.4) }
    case 'fence': return { w: 2, h: 1 }
    case 'canopy': return { w: 2, h: 0.4 }
    case 'concrete-band': return { w: w, h: 0.2 }
    case 'lintel': return { w: 1.4, h: 0.15 }
    case 'gutter': return { w: w, h: 0.12 }
    case 'roof-edge': return { w: w, h: 0.1 }
    case 'chimney': return { w: 0.8, h: 1.2 }
    default: return { w: 1, h: 1 }
  }
}

interface SectionProps {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}

function Section({ title, action, children }: SectionProps) {
  return (
    <div className="rounded-lg border bg-white shadow-sm">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
        {action}
      </div>
      <div className="p-3">{children}</div>
    </div>
  )
}

function LabelledInput({
  label,
  value,
  onChange,
  step = '0.01',
}: {
  label: string
  value: number
  onChange: (v: number) => void
  step?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      />
    </div>
  )
}
