'use client'

/**
 * CUF Import Modal
 *
 * Stap 1 — Selecteer bron (Calc4You of Gilde)
 * Stap 2 — Sleep/kies een CUF-XML bestand (.xml)
 * Stap 3 — Preview en bevestiging
 */

import { useState, useCallback, DragEvent, ChangeEvent } from 'react'
import { Upload, FileCode2, ChevronRight } from 'lucide-react'
import { parseerCufXml, type CufParseResultaat } from '@/lib/everts-calc/cuf-parser'
import {
  getGroepen,
  slaGroepOp, slaCalculatieregelOp, slaComponentregelOp,
  verwijderGroep,
} from '@/lib/everts-calc/local-store'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'
import { Spinner } from '@/components/ui/spinner'

// ─── Types ───────────────────────────────────────────────────────────────────

export type CufBron = 'calc4you' | 'gilde'

interface Props {
  scenarioId: string
  onClose:  () => void
  onImport: () => void
}

// ─── Bron-opties ─────────────────────────────────────────────────────────────

const BRONNEN: { waarde: CufBron; label: string; beschrijving: string; beschikbaar: boolean }[] = [
  {
    waarde:      'calc4you',
    label:       'Calc4You',
    beschrijving:'Calculatiesoftware van Calc4You B.V.',
    beschikbaar:  true,
  },
  {
    waarde:       'gilde',
    label:        'Gilde',
    beschrijving: 'Gilde Calculatiesoftware',
    beschikbaar:  true,
  },
]

// ─── Component ───────────────────────────────────────────────────────────────

export default function CufImportModal({ scenarioId, onClose, onImport }: Props) {
  const [stap, setStap]                   = useState<'bron' | 'bestand' | 'preview'>('bron')
  const [bron, setBron]                   = useState<CufBron | null>(null)
  const [dragOver, setDragOver]           = useState(false)
  const [bestandsnaam, setBestandsnaam]   = useState<string | null>(null)
  const [preview, setPreview]             = useState<CufParseResultaat | null>(null)
  const [fout, setFout]                   = useState<string | null>(null)
  const [bezig, setBezig]                 = useState(false)
  const [modus, setModus]                 = useState<'toevoegen' | 'vervangen'>('toevoegen')
  const [opslagPct, setOpslagPct]         = useState<number>(30)

  // ─── Bron kiezen ─────────────────────────────────────────────────────────

  function kiesBron(gekozenBron: CufBron) {
    setBron(gekozenBron)
    setStap('bestand')
  }

  // ─── Bestand verwerken ───────────────────────────────────────────────────

  const verwerkBestand = useCallback((bestand: File) => {
    if (!bestand.name.toLowerCase().endsWith('.xml')) {
      setFout('Selecteer een .xml bestand (CUF-formaat).')
      return
    }

    setFout(null)
    setPreview(null)
    setBestandsnaam(bestand.name)
    setBezig(true)

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const inhoud = e.target?.result as string
        const resultaat = parseerCufXml(inhoud, scenarioId, bron ?? 'calc4you', opslagPct)

        if (resultaat.groepen.length === 0 && resultaat.calculatieregels.length === 0) {
          setFout('Geen calculatiedata gevonden in dit CUF-bestand.')
          setBestandsnaam(null)
        } else {
          setPreview(resultaat)
          setStap('preview')
        }
      } catch (err) {
        setFout(err instanceof Error ? err.message : 'Fout bij inlezen van het bestand.')
        setBestandsnaam(null)
      } finally {
        setBezig(false)
      }
    }
    reader.onerror = () => {
      setFout('Kan het bestand niet lezen.')
      setBezig(false)
    }
    reader.readAsText(bestand, 'UTF-8')
  }, [scenarioId, bron])

  // ─── Drag & drop ─────────────────────────────────────────────────────────

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
    const bestand = e.dataTransfer.files[0]
    if (bestand) verwerkBestand(bestand)
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const bestand = e.target.files?.[0]
    if (bestand) verwerkBestand(bestand)
    e.target.value = ''
  }

  // ─── Import bevestigen ───────────────────────────────────────────────────

  function bevestigImport() {
    if (!preview) return
    setBezig(true)
    try {
      if (modus === 'vervangen') {
        const bestaandeGroepen = getGroepen(scenarioId)
        bestaandeGroepen.forEach(g => {
          if (g.parent_id === null) verwijderGroep(g.id)
        })
      }
      preview.groepen.forEach(g => slaGroepOp(g))
      preview.calculatieregels.forEach(r => slaCalculatieregelOp(r))
      preview.componentregels.forEach(c => slaComponentregelOp(c))
      onImport()
      onClose()
    } catch (err) {
      setFout('Fout bij opslaan: ' + (err instanceof Error ? err.message : String(err)))
      setBezig(false)
    }
  }

  // ─── Titels per stap ─────────────────────────────────────────────────────

  const stapTitel = stap === 'bron'
    ? 'CUF-bestand importeren'
    : stap === 'bestand'
    ? `CUF importeren — ${bron === 'calc4you' ? 'Calc4You' : 'Gilde'}`
    : 'Importoverzicht'

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent size="sm">

        {/* Header */}
        <DialogHeader>
          <div className="flex items-center gap-2.5 pr-8">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
              <FileCode2 className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <DialogTitle>{stapTitel}</DialogTitle>
              <DialogDescription>Calculatie Uitwisselings Formaat (.xml)</DialogDescription>
            </div>
          </div>
          {/* Stapindicator */}
          <div className="flex items-center gap-1 mr-8">
            {(['bron', 'bestand', 'preview'] as const).map((s) => (
              <div
                key={s}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${
                  stap === s
                    ? 'bg-blue-500'
                    : ['bron','bestand','preview'].indexOf(s) < ['bron','bestand','preview'].indexOf(stap)
                    ? 'bg-blue-200'
                    : 'bg-slate-200'
                }`}
              />
            ))}
          </div>
        </DialogHeader>

        {/* Body */}
        <DialogBody className="space-y-4">

          {/* ─── Stap 1: Bronkeuze ─────────────────────────────────────────── */}
          {stap === 'bron' && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                Selecteer het softwarepakket waarmee het CUF-bestand is aangemaakt:
              </p>
              <div className="space-y-2">
                {BRONNEN.map(optie => (
                  <button
                    key={optie.waarde}
                    onClick={() => optie.beschikbaar && kiesBron(optie.waarde)}
                    disabled={!optie.beschikbaar}
                    className={`w-full flex items-center justify-between gap-3 p-4 rounded-xl border transition-colors text-left ${
                      optie.beschikbaar
                        ? 'border-slate-200 hover:border-blue-300 hover:bg-blue-50 cursor-pointer'
                        : 'border-slate-100 bg-slate-50 opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm ${
                        optie.beschikbaar ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-400'
                      }`}>
                        {optie.label.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{optie.label}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{optie.beschrijving}</p>
                      </div>
                    </div>
                    {optie.beschikbaar && (
                      <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ─── Stap 2: Bestandskeuze ─────────────────────────────────────── */}
          {stap === 'bestand' && (
            <>
              <button
                onClick={() => { setStap('bron'); setFout(null) }}
                className="text-xs text-slate-400 hover:text-slate-600 hover:underline"
              >
                ← Andere software kiezen
              </button>

              {/* Opslag % invoer (alleen voor Calc4You) */}
              {bron === 'calc4you' && (
                <Alert tone="warning" title="Opslag % (uit Calc4You)">
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-xs text-amber-800 flex-1">
                      Prijzen in Calc4You zijn verkoopprijzen incl. opslag. Vul de opslag% in zodat de kostprijs correct berekend wordt.
                    </span>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <input
                        type="number"
                        min={0}
                        max={200}
                        step={1}
                        value={opslagPct}
                        onChange={(e) => setOpslagPct(Math.max(0, Number(e.target.value)))}
                        className="w-16 text-right px-2 py-1 text-sm border border-amber-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 font-mono"
                      />
                      <span className="text-sm text-amber-700 font-medium">%</span>
                    </div>
                  </div>
                </Alert>
              )}

              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                  dragOver
                    ? 'border-blue-400 bg-blue-50'
                    : 'border-slate-200 hover:border-slate-300 bg-slate-50'
                }`}
              >
                {bezig ? (
                  <div className="flex flex-col items-center gap-2">
                    <Spinner size="xl" />
                    <p className="text-sm text-slate-600">Bestand inlezen…</p>
                  </div>
                ) : (
                  <>
                    <Upload className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                    <p className="text-sm font-medium text-slate-700">
                      Sleep een {bron === 'calc4you' ? 'Calc4You' : 'Gilde'} CUF-bestand hierheen
                    </p>
                    <p className="text-xs text-slate-400 mt-1">of</p>
                    <label className="mt-3 inline-block cursor-pointer">
                      <Button variant="outline" size="sm" asChild>
                        <span>Bestand kiezen</span>
                      </Button>
                      <input
                        type="file"
                        accept=".xml"
                        className="sr-only"
                        onChange={handleFileChange}
                      />
                    </label>
                    <p className="text-xs text-slate-400 mt-3">
                      {bron === 'calc4you'
                        ? 'Exporteer vanuit Calc4You via Bestand → Exporteren → CUF'
                        : 'Exporteer vanuit Gilde via het exportmenu'
                      }
                    </p>
                  </>
                )}
              </div>
            </>
          )}

          {/* ─── Stap 3: Preview ───────────────────────────────────────────── */}
          {stap === 'preview' && preview && (
            <div className="space-y-3">
              <Alert tone="success" title={bestandsnaam ?? undefined}>
                {preview.projectNaam && (
                  <p className="text-xs">
                    Project: {preview.projectNaam}
                    {preview.projectNummer && ` (${preview.projectNummer})`}
                  </p>
                )}
              </Alert>

              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Groepen',     waarde: preview.groepen.length },
                  { label: 'Regels',      waarde: preview.calculatieregels.length },
                  { label: 'Componenten', waarde: preview.componentregels.length },
                ].map(({ label, waarde }) => (
                  <div key={label} className="text-center p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <div className="text-xl font-bold text-slate-800">{waarde}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{label}</div>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-600">Importmodus:</p>
                <div className="space-y-1.5">
                  {[
                    {
                      waarde:      'toevoegen' as const,
                      label:       'Toevoegen aan bestaande calculatie',
                      beschrijving:'Nieuwe groepen en regels worden toegevoegd',
                    },
                    {
                      waarde:       'vervangen' as const,
                      label:        'Bestaande calculatie vervangen',
                      beschrijving: 'Alle huidige groepen en regels worden verwijderd',
                    },
                  ].map(optie => (
                    <label
                      key={optie.waarde}
                      className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                        modus === optie.waarde
                          ? 'border-blue-300 bg-blue-50'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="modus"
                        value={optie.waarde}
                        checked={modus === optie.waarde}
                        onChange={() => setModus(optie.waarde)}
                        className="mt-0.5 accent-blue-600"
                      />
                      <div>
                        <p className="text-sm font-medium text-slate-700">{optie.label}</p>
                        <p className="text-xs text-slate-400">{optie.beschrijving}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <label className="block text-center cursor-pointer">
                <span className="text-xs text-slate-400 hover:text-slate-600 hover:underline">
                  Ander bestand kiezen
                </span>
                <input
                  type="file"
                  accept=".xml"
                  className="sr-only"
                  onChange={(e) => {
                    setPreview(null)
                    setBestandsnaam(null)
                    setStap('bestand')
                    const bestand = e.target.files?.[0]
                    if (bestand) verwerkBestand(bestand)
                    e.target.value = ''
                  }}
                />
              </label>
            </div>
          )}

          {/* Foutmelding */}
          {fout && (
            <Alert tone="error">{fout}</Alert>
          )}
        </DialogBody>

        {/* Footer */}
        <DialogFooter split>
          <Button variant="outline" size="md" onClick={onClose}>
            Annuleren
          </Button>

          {stap === 'preview' && (
            <Button
              variant="primary"
              size="md"
              onClick={bevestigImport}
              disabled={!preview || bezig}
              loading={bezig}
            >
              {!bezig && <FileCode2 className="w-4 h-4" />}
              {bezig
                ? 'Importeren…'
                : preview
                  ? `${preview.calculatieregels.length} regel${preview.calculatieregels.length !== 1 ? 's' : ''} importeren`
                  : 'Importeren'
              }
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
