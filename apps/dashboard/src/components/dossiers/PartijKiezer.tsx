'use client'

/**
 * Zoekveld voor de partij bij een uitvraag: een onderaannemer of leverancier uit het adresboek.
 *
 * Hergebruikt bewust de bestaande server-action `zoekRelaties` (die filtert al op `types` en op
 * `actief`), maar niet het bestaande `RelatieZoekveld` uit de werkbegroting: dat is gestyled voor een
 * dichte grid-cel (randloos, 10px tekst) en past niet in een dossiertab.
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { Search, X } from 'lucide-react'
import { Spinner } from '@/components/ui'
import { zoekRelaties } from '@/app/(platform)/everts-calc/actions/werkbegroting'
import type { RelatieRef } from '@/lib/everts-calc/types'
import type { UitvraagSoort } from '@everts/database'

type Props = {
  soort: UitvraagSoort
  /** Gekozen partij; leeg = nog niets gekozen. */
  naam?: string | null
  onKies: (relatieId: string, naam: string) => void
  onWis: () => void
  disabled?: boolean
  placeholder?: string
}

export default function PartijKiezer({ soort, naam, onKies, onWis, disabled, placeholder }: Props) {
  const [zoekterm, setZoekterm] = useState('')
  const [resultaten, setResultaten] = useState<RelatieRef[]>([])
  const [bezig, setBezig] = useState(false)
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const zoek = useCallback(async (term: string) => {
    if (term.trim().length < 2) { setResultaten([]); return }
    setBezig(true)
    try {
      setResultaten(await zoekRelaties(term, soort === 'leverancier' ? 'leverancier' : 'onderaannemer'))
    } finally {
      setBezig(false)
    }
  }, [soort])

  // Debounce: 300 ms, zelfde ritme als de andere zoekvelden in EVA.
  const bijTypen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    setZoekterm(v)
    setOpen(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => zoek(v), 300)
  }

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  if (naam) {
    return (
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="truncate text-[12.5px] text-neutral-800" title={naam}>{naam}</span>
        {!disabled && (
          <button
            type="button"
            onClick={onWis}
            title="Andere partij kiezen"
            className="flex-shrink-0 text-neutral-400 hover:text-neutral-700"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-1.5 rounded border border-neutral-200 bg-white px-1.5 focus-within:border-brand-500">
        <Search className="w-3 h-3 flex-shrink-0 text-neutral-400" />
        <input
          className="flex-1 min-w-0 bg-transparent py-1 text-[12.5px] text-neutral-800 outline-none placeholder:text-neutral-400"
          value={zoekterm}
          disabled={disabled}
          placeholder={placeholder ?? (soort === 'leverancier' ? 'Zoek leverancier…' : 'Zoek onderaannemer…')}
          onChange={bijTypen}
          onFocus={() => zoekterm.trim().length >= 2 && setOpen(true)}
          // Vertraagd sluiten: anders is de knop weg vóór de klik erop landt.
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {bezig && <Spinner size="sm" className="flex-shrink-0" />}
      </div>

      {open && resultaten.length > 0 && (
        <div className="absolute left-0 top-full z-50 mt-0.5 max-h-52 w-72 overflow-y-auto rounded-lg border border-neutral-200 bg-white py-1 shadow-lg">
          {resultaten.map(r => (
            <button
              key={r.id}
              type="button"
              className="w-full px-3 py-1.5 text-left hover:bg-neutral-50"
              onMouseDown={() => {
                onKies(r.id, r.naam)
                setZoekterm('')
                setResultaten([])
                setOpen(false)
              }}
            >
              <p className="truncate text-[12.5px] font-medium text-neutral-800">{r.naam}</p>
              {r.email
                ? <p className="truncate text-[11px] text-neutral-400">{r.email}</p>
                : <p className="text-[11px] text-warning-600">Geen e-mailadres bekend</p>}
            </button>
          ))}
        </div>
      )}

      {open && !bezig && zoekterm.trim().length >= 2 && resultaten.length === 0 && (
        <div className="absolute left-0 top-full z-50 mt-0.5 w-72 rounded-lg border border-neutral-200 bg-white px-3 py-2 shadow-lg">
          <p className="text-[12px] text-neutral-500">
            Geen actieve {soort === 'leverancier' ? 'leverancier' : 'onderaannemer'} gevonden.
          </p>
        </div>
      )}
    </div>
  )
}
