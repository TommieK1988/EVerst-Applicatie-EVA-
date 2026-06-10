'use client'

/**
 * CUF Import Modal
 *
 * Laat de gebruiker een CUF-XML bestand (.xml) selecteren of drag-droppen.
 * Parseert het bestand client-side met DOMParser en toont een preview
 * (aantal groepen, regels, componenten) vóór het opslaan in localStorage.
 */

import { useState, useCallback, DragEvent, ChangeEvent } from 'react'
import { X, Upload, FileCode2, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { parseerCufXml, type CufParseResultaat } from '@/lib/cuf-parser'
import {
  getGroepen, getCalculatieregels, getComponentregels,
  slaGroepOp, slaCalculatieregelOp, slaComponentregelOp,
  verwijderGroep,
} from '@/lib/local-store'

// ─── Props ───────────────────────────────────────────────────────────────────

interface Props {
  scenarioId: string
  onClose: () => void
  onImport: () => void   // callback na succesvolle import (refresh parent)
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function CufImportModal({ scenarioId, onClose, onImport }: Props) {
  const [dragOver, setDragOver]         = useState(false)
  const [bestandsnaam, setBestandsnaam] = useState<string | null>(null)
  const [preview, setPreview]           = useState<CufParseResultaat | null>(null)
  const [fout, setFout]                 = useState<string | null>(null)
  const [bezig, setBezig]               = useState(false)
  const [modus, setModus]               = useState<'toevoegen' | 'vervangen'>('toevoegen')

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
        const resultaat = parseerCufXml(inhoud, scenarioId)

        if (resultaat.groepen.length === 0 && resultaat.calculatieregels.length === 0) {
          setFout('Geen calculatiedata gevonden in dit CUF-bestand.')
          setBestandsnaam(null)
        } else {
          setPreview(resultaat)
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
  }, [scenarioId])

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
    // Reset zodat hetzelfde bestand opnieuw gekozen kan worden
    e.target.value = ''
  }

  // ─── Import bevestigen ───────────────────────────────────────────────────

  function bevestigImport() {
    if (!preview) return
    setBezig(true)

    try {
      if (modus === 'vervangen') {
        // Verwijder alle bestaande groepen van dit scenario (cascade verwijdert regels + componenten)
        const bestaandeGroepen = getGroepen(scenarioId)
        bestaandeGroepen.forEach(g => {
          if (g.parent_id === null) verwijderGroep(g.id)
        })
      }

      // Sla nieuwe data op
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

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
              <FileCode2 className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-800">CUF-bestand importeren</h2>
              <p className="text-xs text-slate-500">Calculatie Uitwisselings Formaat (.xml)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">

          {/* Drop zone */}
          {!preview && (
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
                  <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                  <p className="text-sm text-slate-600">Bestand inlezen…</p>
                </div>
              ) : (
                <>
                  <Upload className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm font-medium text-slate-700">
                    Sleep een CUF-bestand hierheen
                  </p>
                  <p className="text-xs text-slate-400 mt-1">of</p>
                  <label className="mt-3 inline-block cursor-pointer">
                    <span className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors font-medium">
                      Bestand kiezen
                    </span>
                    <input
                      type="file"
                      accept=".xml"
                      className="sr-only"
                      onChange={handleFileChange}
                    />
                  </label>
                  <p className="text-xs text-slate-400 mt-3">
                    Ondersteund door Ibis, AFAS, Admicom, 2Jours, Acto, InfraCalc
                  </p>
                </>
              )}
            </div>
          )}

          {/* Foutmelding */}
          {fout && (
            <div className="flex items-start gap-2.5 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{fout}</p>
            </div>
          )}

          {/* Preview na succesvol inlezen */}
          {preview && (
            <div className="space-y-3">
              {/* Bestandsnaam */}
              <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-green-800 truncate">{bestandsnaam}</p>
                  {preview.projectNaam && (
                    <p className="text-xs text-green-600">
                      Project: {preview.projectNaam}
                      {preview.projectNummer && ` (${preview.projectNummer})`}
                    </p>
                  )}
                </div>
              </div>

              {/* Statistieken */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Groepen',  waarde: preview.groepen.length },
                  { label: 'Regels',   waarde: preview.calculatieregels.length },
                  { label: 'Componenten', waarde: preview.componentregels.length },
                ].map(({ label, waarde }) => (
                  <div key={label} className="text-center p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <div className="text-xl font-bold text-slate-800">{waarde}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{label}</div>
                  </div>
                ))}
              </div>

              {/* Importmodus */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-600">Importmodus:</p>
                <div className="space-y-1.5">
                  {[
                    {
                      waarde: 'toevoegen' as const,
                      label: 'Toevoegen aan bestaande calculatie',
                      beschrijving: 'Nieuwe groepen en regels worden toegevoegd',
                    },
                    {
                      waarde: 'vervangen' as const,
                      label: 'Bestaande calculatie vervangen',
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

              {/* Ander bestand kiezen */}
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
                    const bestand = e.target.files?.[0]
                    if (bestand) verwerkBestand(bestand)
                    e.target.value = ''
                  }}
                />
              </label>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-slate-200 bg-slate-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-white transition-colors"
          >
            Annuleren
          </button>
          <button
            onClick={bevestigImport}
            disabled={!preview || bezig}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {bezig ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Importeren…
              </>
            ) : (
              <>
                <FileCode2 className="w-4 h-4" />
                {preview
                  ? `${preview.calculatieregels.length} regel${preview.calculatieregels.length !== 1 ? 's' : ''} importeren`
                  : 'Importeren'
                }
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
