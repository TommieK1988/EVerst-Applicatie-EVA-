'use client'

import React, { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CalendarRange } from 'lucide-react'
import { PRESET_LABELS, type Periode, type PeriodePreset } from '@/lib/wagenpark/periode'

const PRESETS: Exclude<PeriodePreset, 'aangepast'>[] = [
  'dit-kwartaal',
  'vorig-kwartaal',
  'dit-jaar',
  'vorig-jaar',
]

/**
 * Periodekeuze boven de tabel. De keuze gaat via de URL en niet via state, zodat
 * je een periode kunt bewaren of doorsturen — en zodat de server meteen de
 * juiste rijen ophaalt in plaats van alles te laden en client-side te filteren.
 */
export default function PeriodeKiezer({ periode }: { periode: Periode }) {
  const router = useRouter()
  const params = useSearchParams()
  const [open, setOpen] = useState(periode.preset === 'aangepast')
  const [van, setVan] = useState(periode.van)
  const [tot, setTot] = useState(periode.tot)

  function ga(next: URLSearchParams) {
    // De weergave-keuze (per dag / per medewerker) moet de periodewissel
    // overleven, dus die nemen we ongewijzigd mee.
    const weergave = params.get('weergave')
    if (weergave) next.set('weergave', weergave)
    router.push(`/wagenpark/werktijden?${next.toString()}`)
  }

  function kiesPreset(preset: string) {
    setOpen(false)
    ga(new URLSearchParams({ periode: preset }))
  }

  function kiesEigen() {
    if (!van || !tot) return
    ga(new URLSearchParams({ van, tot }))
  }

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      {PRESETS.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => kiesPreset(p)}
          className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
            periode.preset === p
              ? 'bg-slate-900 text-white border-slate-900'
              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
          }`}
        >
          {PRESET_LABELS[p]}
        </button>
      ))}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm border transition-colors ${
          periode.preset === 'aangepast'
            ? 'bg-slate-900 text-white border-slate-900'
            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
        }`}
      >
        <CalendarRange className="w-4 h-4" />
        Zelf kiezen
      </button>

      {open && (
        <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-slate-300 bg-white">
          <input
            type="date"
            value={van}
            onChange={(e) => setVan(e.target.value)}
            className="text-sm border-0 p-0 focus:ring-0 text-slate-700"
            aria-label="Van datum"
          />
          <span className="text-slate-400 text-sm">t/m</span>
          <input
            type="date"
            value={tot}
            onChange={(e) => setTot(e.target.value)}
            className="text-sm border-0 p-0 focus:ring-0 text-slate-700"
            aria-label="Tot en met datum"
          />
          <button
            type="button"
            onClick={kiesEigen}
            className="ml-1 px-2 py-0.5 rounded bg-green-600 text-white text-xs hover:bg-green-700"
          >
            Toon
          </button>
        </span>
      )}
    </div>
  )
}
