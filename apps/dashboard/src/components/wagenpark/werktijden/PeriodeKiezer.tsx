'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { CalendarRange } from 'lucide-react'
import { PRESET_LABELS, type Periode, type PeriodePreset } from '@/lib/wagenpark/periode'

const PRESETS: Exclude<PeriodePreset, 'aangepast'>[] = [
  'dit-kwartaal',
  'vorig-kwartaal',
  'dit-jaar',
  'vorig-jaar',
]

/** De parameters die deze kiezer zélf beheert; al het andere blijft staan. */
const EIGEN_PARAMS = ['periode', 'van', 'tot']

/**
 * Periodekeuze boven een overzicht. De keuze gaat via de URL en niet via state,
 * zodat je een periode kunt bewaren of doorsturen — en zodat de server meteen de
 * juiste rijen ophaalt in plaats van alles te laden en client-side te filteren.
 *
 * `pad` is de pagina waar de kiezer op staat: hij wordt gebruikt door het
 * wagenpark-dashboard én door het werktijden-blok op een bestuurder.
 */
export default function PeriodeKiezer({
  periode,
  pad,
}: {
  periode: Periode
  /** Route waarnaar genavigeerd wordt, bv. `/wagenpark/dashboard`. */
  pad: string
}) {
  const params = useSearchParams()
  const [open, setOpen] = useState(periode.preset === 'aangepast')
  const [van, setVan] = useState(periode.van)
  const [tot, setTot] = useState(periode.tot)

  /**
   * Adres van deze pagina met een andere periode erin.
   *
   * Alles wat niet over de periode gaat blijft staan — een rit-typefilter, een
   * geopende sectie, welke tab dan ook. Anders klapt de pagina bij het kiezen
   * van een ander kwartaal terug naar de begintoestand.
   */
  function href(eigen: Record<string, string>): string {
    const next = new URLSearchParams(eigen)
    for (const [sleutel, waarde] of params.entries()) {
      if (!EIGEN_PARAMS.includes(sleutel)) next.set(sleutel, waarde)
    }
    return `${pad}?${next.toString()}`
  }

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      {/* Echte links, geen knoppen met `router.push`: de doel-URL staat dan in de
          statusbalk, je kunt een periode in een nieuw tabblad openen of het adres
          kopiëren, en Next haalt de pagina alvast op zodra je erover zweeft. */}
      {PRESETS.map((p) => (
        <Link
          key={p}
          href={href({ periode: p })}
          onClick={() => setOpen(false)}
          className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
            periode.preset === p
              ? 'bg-slate-900 text-white border-slate-900'
              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
          }`}
        >
          {PRESET_LABELS[p]}
        </Link>
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
          <Link
            href={van && tot ? href({ van, tot }) : '#'}
            aria-disabled={!van || !tot}
            className={`ml-1 px-2 py-0.5 rounded text-white text-xs ${
              van && tot ? 'bg-green-600 hover:bg-green-700' : 'bg-slate-300 pointer-events-none'
            }`}
          >
            Toon
          </Link>
        </span>
      )}
    </div>
  )
}
