'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { X, Search, Package } from 'lucide-react'
import { getActieveMaterialen } from '@/app/(platform)/everts-calc/actions/materialen'
import { formatEuro } from '@/lib/everts-calc/calculations'
import type { Materiaal } from '@/lib/everts-calc/types'
import { Button } from '@/components/ui'

interface Props {
  artikelnummer?: string
  omschrijving?: string
  onSelecteer: (m: Materiaal) => void
  onWis: () => void
}

export default function MateriaalZoekveld({ artikelnummer, omschrijving, onSelecteer, onWis }: Props) {
  const [zoekterm, setZoekterm] = useState('')
  const [resultaten, setResultaten] = useState<Materiaal[]>([])
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const alleRef = useRef<Materiaal[] | null>(null)

  // Actieve materialen één keer (lazy) uit Supabase laden, daarna client-side filteren.
  const zorgGeladen = useCallback(async () => {
    if (alleRef.current) return alleRef.current
    try {
      const lijst = await getActieveMaterialen()
      alleRef.current = lijst
      return lijst
    } catch {
      alleRef.current = []
      return []
    }
  }, [])

  const zoek = useCallback(async (term: string) => {
    if (term.length < 1) { setResultaten([]); return }
    const t = term.toLowerCase()
    const alle = await zorgGeladen()
    setResultaten(
      alle
        .filter(m =>
          m.omschrijving.toLowerCase().includes(t) ||
          (m.artikelnummer ?? '').toLowerCase().includes(t) ||
          (m.leverancier ?? '').toLowerCase().includes(t) ||
          (m.materiaalgroep ?? '').toLowerCase().includes(t)
        )
        .slice(0, 20)
    )
  }, [zorgGeladen])

  // Vast laden zodra het veld in beeld komt, zodat de eerste toetsaanslag direct filtert.
  useEffect(() => { void zorgGeladen() }, [zorgGeladen])

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setZoekterm(val)
    setOpen(true)
    zoek(val)
  }

  // Toon chip als er een materiaal geselecteerd is
  if (artikelnummer || omschrijving) {
    return (
      <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-orange-50/60 border border-orange-200/50 max-w-full">
        <Package className="w-2.5 h-2.5 text-orange-400 flex-shrink-0" />
        <span className="text-xs text-orange-700 truncate flex-1 min-w-0" title={omschrijving}>
          {artikelnummer ?? omschrijving}
        </span>
        <Button variant="ghost" size="icon-sm" onClick={onWis} className="flex-shrink-0 h-4 w-4 min-h-0 min-w-0 text-orange-400/60 hover:text-orange-500">
          <X className="w-2.5 h-2.5" />
        </Button>
      </div>
    )
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-1">
        <Search className="flex-shrink-0 w-2.5 h-2.5 text-slate-300" />
        <input
          ref={inputRef}
          className="flex-1 min-w-0 text-xs px-1 py-0.5 rounded border-0 bg-transparent
            hover:bg-white hover:border hover:border-slate-200
            focus:bg-white focus:border focus:border-slate-300 focus:outline-none
            text-slate-600 placeholder:text-slate-300"
          value={zoekterm}
          placeholder="Materiaal zoeken…"
          onChange={handleInput}
          onFocus={() => zoekterm.length >= 1 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
      </div>

      {open && resultaten.length > 0 && (
        <div className="absolute left-0 top-full mt-0.5 w-72 bg-white border border-slate-200 rounded-lg shadow-lg z-50 py-1 max-h-52 overflow-y-auto">
          {resultaten.map(m => (
            <button
              key={m.id}
              className="w-full text-left px-3 py-1.5 hover:bg-orange-50 transition-colors border-b border-slate-50 last:border-0"
              onMouseDown={() => { onSelecteer(m); setZoekterm(''); setOpen(false) }}
            >
              <p className="text-xs font-medium text-slate-700 truncate">{m.omschrijving}</p>
              <p className="text-[10px] text-slate-400 truncate">
                {[m.artikelnummer, m.leverancier].filter(Boolean).join(' · ')}
                {m.eenheid && <span className="ml-1">· {m.eenheid}</span>}
                <span className="ml-1 font-semibold text-orange-600">· {formatEuro(m.kostprijs)}</span>
              </p>
            </button>
          ))}
        </div>
      )}

      {open && zoekterm.length >= 1 && resultaten.length === 0 && (
        <div className="absolute left-0 top-full mt-0.5 w-56 bg-white border border-slate-200 rounded-lg shadow-lg z-50 px-3 py-2">
          <p className="text-xs text-slate-400">Geen materialen gevonden</p>
          <p className="text-[10px] text-slate-300 mt-0.5">Voeg materialen toe via de bibliotheek</p>
        </div>
      )}
    </div>
  )
}
