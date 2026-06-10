'use client'

import { useState, useEffect } from 'react'
import { Trash2, Calculator, ChevronDown } from 'lucide-react'
import { nieuweId } from '@/lib/everts-calc/utils'
import type { Eenheid } from '@/lib/everts-calc/types'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

// ─── Types ────────────────────────────────────────────────────────────────────

type MaatEenheid = string

interface Maatrij {
  id: string
  omschrijving: string
  dim1: number   // breedte (m²), lengte (m¹/m³), aantal (overig)
  dim2: number   // hoogte (m²), breedte (m³)
  dim3: number   // hoogte (m³ only)
  factor: number
}

interface Props {
  open: boolean
  eenheid: Eenheid | string
  hoeveelheid: number
  onBevestig: (hoeveelheid: number, eenheid?: Eenheid) => void
  onSluiten: () => void
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Eenheden waarbij de meetstaat alleen een 'Aantal' veld heeft (geen factor/dimensies) */
const isSimple = (e: string) => !['m²', 'm¹', 'm³'].includes(e)

function bereken(rij: Maatrij, eenh: MaatEenheid): number {
  if (eenh === 'm²') return rij.dim1 * rij.dim2 * (rij.factor || 1)
  if (eenh === 'm³') return rij.dim1 * rij.dim2 * rij.dim3 * (rij.factor || 1)
  if (eenh === 'm¹') return rij.dim1 * (rij.factor || 1)
  return rij.dim1   // st, post, uur, dag, … — alleen aantal
}

function rijHeeftData(r: Maatrij) {
  return r.dim1 > 0 || r.dim2 > 0 || r.dim3 > 0 || !!r.omschrijving
}

function legeRij(): Maatrij {
  return { id: nieuweId(), omschrijving: '', dim1: 0, dim2: 0, dim3: 0, factor: 1 }
}

function prefillRij(hoeveelheid: number, eenh: MaatEenheid): Maatrij {
  const rij = legeRij()
  if (hoeveelheid <= 0) return rij
  if (eenh === 'm²') {
    const z = +Math.sqrt(hoeveelheid).toFixed(2)
    return { ...rij, dim1: z, dim2: z, factor: 1 }
  }
  if (eenh === 'm³') {
    const z = +Math.cbrt(hoeveelheid).toFixed(2)
    return { ...rij, dim1: z, dim2: z, dim3: z, factor: 1 }
  }
  return { ...rij, dim1: hoeveelheid, factor: 1 }
}

// ─── Kolom headers per eenheid ────────────────────────────────────────────────

function kolomHeaders(eenh: MaatEenheid): { label: string; title?: string }[] {
  if (eenh === 'm²') return [
    { label: 'Omschrijving' },
    { label: 'B (m)', title: 'Breedte' },
    { label: 'H (m)', title: 'Hoogte' },
    { label: 'F', title: 'Factor (aantal gelijke vlakken)' },
    { label: 'Totaal' },
  ]
  if (eenh === 'm³') return [
    { label: 'Omschrijving' },
    { label: 'L (m)', title: 'Lengte' },
    { label: 'B (m)', title: 'Breedte' },
    { label: 'H (m)', title: 'Hoogte' },
    { label: 'F', title: 'Factor' },
    { label: 'Totaal' },
  ]
  if (eenh === 'm¹') return [
    { label: 'Omschrijving' },
    { label: 'L (m)', title: 'Lengte' },
    { label: 'F', title: 'Factor (aantal)' },
    { label: 'Totaal' },
  ]
  // st, post, uur, dag, … — alleen aantal
  return [
    { label: 'Omschrijving' },
    { label: 'Aantal' },
    { label: 'Totaal' },
  ]
}

// ─── Nummer-input helper ──────────────────────────────────────────────────────

function Ni({ value, onChange, placeholder, onTab }: {
  value: number
  onChange: (v: number) => void
  placeholder?: string
  onTab?: () => void
}) {
  const [raw, setRaw] = useState(value === 0 ? '' : String(value))
  useEffect(() => { setRaw(value === 0 ? '' : String(value)) }, [value])

  return (
    <input
      type="number"
      step="any"
      value={raw}
      placeholder={placeholder ?? '0'}
      className="w-full text-xs text-right font-mono px-1.5 py-1 rounded border border-slate-200
        focus:outline-none focus:border-everts/50 focus:ring-1 focus:ring-everts/20 bg-white
        hover:border-slate-300"
      onChange={e => {
        setRaw(e.target.value)
        const v = parseFloat(e.target.value)
        onChange(isNaN(v) ? 0 : v)
      }}
      onKeyDown={e => { if (e.key === 'Tab' && onTab) { e.preventDefault(); onTab() } }}
    />
  )
}

// ─── Meetrij component ────────────────────────────────────────────────────────

function MeetrijRij({
  rij, eenh, totaal, isLeeg, onChange, onVerwijder,
}: {
  rij: Maatrij
  eenh: MaatEenheid
  totaal: number
  isLeeg: boolean   // laatste lege rij → geen delete knop
  onChange: (patch: Partial<Maatrij>) => void
  onVerwijder: () => void
}) {
  const simple = isSimple(eenh)

  return (
    <tr className="border-b border-slate-100 last:border-0 group/rij hover:bg-slate-50/60">
      {/* Omschrijving */}
      <td className="px-1.5 py-1">
        <input
          type="text"
          value={rij.omschrijving}
          placeholder={isLeeg ? 'Nieuwe meting…' : 'Omschrijving…'}
          className={`w-full text-xs px-1.5 py-1 rounded border
            focus:outline-none focus:border-everts/50 focus:ring-1 focus:ring-everts/20 bg-white
            hover:border-slate-300 text-slate-700 placeholder-slate-300 transition-colors
            ${isLeeg ? 'border-dashed border-slate-200' : 'border-slate-200'}`}
          onChange={e => onChange({ omschrijving: e.target.value })}
        />
      </td>

      {/* dim1: breedte / lengte / aantal */}
      <td className="px-1 py-1 w-24">
        <Ni value={rij.dim1} onChange={v => onChange({ dim1: v })} />
      </td>

      {/* dim2: hoogte (m²), breedte (m³) */}
      {(eenh === 'm²' || eenh === 'm³') && (
        <td className="px-1 py-1 w-24">
          <Ni value={rij.dim2} onChange={v => onChange({ dim2: v })} />
        </td>
      )}

      {/* dim3: hoogte (m³ only) */}
      {eenh === 'm³' && (
        <td className="px-1 py-1 w-24">
          <Ni value={rij.dim3} onChange={v => onChange({ dim3: v })} />
        </td>
      )}

      {/* Factor — alleen voor dimensionale eenheden */}
      {!simple && (
        <td className="px-1 py-1 w-16">
          <Ni value={rij.factor} onChange={v => onChange({ factor: v })} placeholder="1" />
        </td>
      )}

      {/* Totaal */}
      <td className="px-2 py-1 text-right w-24">
        <span className={`text-xs font-mono font-semibold ${totaal > 0 ? 'text-slate-700' : 'text-slate-300'}`}>
          {totaal > 0 ? totaal.toFixed(3) : '—'}
        </span>
      </td>

      {/* Verwijder */}
      <td className="px-1 py-1 w-7 text-center">
        {!isLeeg && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onVerwijder}
            title="Rij verwijderen"
            className="opacity-0 group-hover/rij:opacity-100 text-slate-300 hover:text-red-400 hover:bg-transparent"
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        )}
      </td>
    </tr>
  )
}

// ─── Eenheid kiezer ───────────────────────────────────────────────────────────

const MEET_EENHEDEN = ['m²', 'm¹', 'm³', 'st', 'post', 'uur', 'dag', 'ltr', 'kg', 'set'] as const

function EenheidKiezer({ huidig, onChange }: { huidig: string; onChange: (e: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded
          bg-everts/10 text-everts hover:bg-everts/20 border border-everts/20 transition-colors"
      >
        {huidig || '—'}
        <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-[61] p-1.5 flex flex-wrap gap-1 w-52">
            {MEET_EENHEDEN.map(e => (
              <button
                key={e}
                onClick={() => { onChange(e); setOpen(false) }}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  huidig === e
                    ? 'bg-everts text-white'
                    : ['m²', 'm¹', 'm³'].includes(e)
                      ? 'border border-everts/20 text-everts hover:bg-everts/10'
                      : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {e}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Hoofd component ─────────────────────────────────────────────────────────

export default function MiniMeetstaat({ open, eenheid, hoeveelheid, onBevestig, onSluiten }: Props) {
  const [gekozenEenheid, setGekozenEenheid] = useState<string>(eenheid || '')
  const [rijen, setRijen] = useState<Maatrij[]>([legeRij()])

  // Reset wanneer de dialog opent
  useEffect(() => {
    if (!open) return
    const eenh = eenheid || ''
    setGekozenEenheid(eenh)
    // Pre-fill als er al een waarde is, gevolgd door een lege rij
    setRijen(hoeveelheid > 0 ? [prefillRij(hoeveelheid, eenh), legeRij()] : [legeRij()])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Auto-append lege rij als de laatste rij data heeft
  useEffect(() => {
    const last = rijen[rijen.length - 1]
    if (rijHeeftData(last)) {
      setRijen(rs => [...rs, legeRij()])
    }
  }, [rijen])

  // Reset rijen bij eenheidswisseling (dimensies zijn incompatibel)
  const handleEenheidWijzig = (e: string) => {
    setGekozenEenheid(e)
    setRijen([legeRij()])
  }

  const totalen = rijen.map(r => bereken(r, gekozenEenheid))
  const eindtotaal = +(totalen.reduce((s, t) => s + t, 0)).toFixed(4)

  const updateRij = (id: string, patch: Partial<Maatrij>) =>
    setRijen(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r))

  const verwijderRij = (id: string) =>
    setRijen(rs => rs.length > 1 ? rs.filter(r => r.id !== id) : rs)

  const handleBevestig = () => {
    if (eindtotaal <= 0) return
    const eenheidGewijzigd = gekozenEenheid !== eenheid
    onBevestig(eindtotaal, eenheidGewijzigd ? gekozenEenheid as Eenheid : undefined)
  }

  const headers = kolomHeaders(gekozenEenheid)
  const simple = isSimple(gekozenEenheid)

  const formuleHint =
    gekozenEenheid === 'm²' ? 'Σ (B × H × F)' :
    gekozenEenheid === 'm³' ? 'Σ (L × B × H × F)' :
    gekozenEenheid === 'm¹' ? 'Σ (L × F)' :
    'Σ Aantal'

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onSluiten() }}>
      <DialogContent
        size="lg"
        onOpenAutoFocus={e => e.preventDefault()}
        className="max-h-[80vh] flex flex-col"
      >
        {/* Header */}
        <DialogHeader className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100 flex-shrink-0">
          <div className="p-1.5 rounded-lg bg-everts/10 flex-shrink-0">
            <Calculator className="w-4 h-4 text-everts" />
          </div>
          <div className="flex-1 min-w-0">
            <DialogTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              Mini meetstaat
              <EenheidKiezer huidig={gekozenEenheid} onChange={handleEenheidWijzig} />
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400 mt-0.5">
              {gekozenEenheid
                ? `Bereken de totale hoeveelheid — ${formuleHint}`
                : 'Klik op de eenheid hierboven om te beginnen'
              }
            </DialogDescription>
          </div>
        </DialogHeader>

        {/* Lege eenheid: snelle kiezer */}
        {!gekozenEenheid && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 gap-4">
            <p className="text-sm text-slate-500 text-center">
              Kies de eenheid hierboven om te beginnen
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {MEET_EENHEDEN.map(e => (
                <button
                  key={e}
                  onClick={() => setGekozenEenheid(e)}
                  className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    ['m²', 'm¹', 'm³'].includes(e)
                      ? 'border-everts/30 text-everts bg-everts/5 hover:bg-everts/10'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Meetrijen tabel */}
        {gekozenEenheid && (
          <>
            <div className="flex-1 overflow-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 sticky top-0">
                    {headers.map((h, i) => (
                      <th
                        key={i}
                        title={h.title}
                        className={`px-2 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide
                          ${i === 0 ? 'text-left' : 'text-right'}`}
                      >
                        {h.label}
                      </th>
                    ))}
                    <th className="w-7" />
                  </tr>
                </thead>
                <tbody>
                  {rijen.map((rij, idx) => {
                    const isLaatsteLeeg = idx === rijen.length - 1 && !rijHeeftData(rij)
                    return (
                      <MeetrijRij
                        key={rij.id}
                        rij={rij}
                        eenh={gekozenEenheid}
                        totaal={totalen[idx]}
                        isLeeg={isLaatsteLeeg}
                        onChange={patch => updateRij(rij.id, patch)}
                        onVerwijder={() => verwijderRij(rij.id)}
                      />
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <DialogFooter split className="border-t border-slate-100 bg-slate-50/50 px-4 py-3">
              {/* Formule hint links */}
              <span className="text-[11px] text-slate-400 font-mono hidden sm:block">
                {simple ? 'Typ in de lege rij om te beginnen' : formuleHint}
              </span>

              <div className="flex items-center gap-4">
                {/* Eindtotaal */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-400">Totaal:</span>
                  <span className={`text-sm font-bold font-mono ${eindtotaal > 0 ? 'text-everts' : 'text-slate-300'}`}>
                    {eindtotaal > 0 ? eindtotaal.toFixed(2) : '—'}
                  </span>
                  <span className="text-xs font-semibold text-slate-500">{gekozenEenheid}</span>
                </div>

                <Button variant="ghost" size="sm" onClick={onSluiten}>
                  Annuleren
                </Button>

                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleBevestig}
                  disabled={eindtotaal <= 0}
                >
                  Overnemen
                </Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
