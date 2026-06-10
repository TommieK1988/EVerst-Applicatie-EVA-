'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { X, Search, Loader2 } from 'lucide-react'
import { zoekRelaties } from '@/app/actions/werkbegroting'
import type { RelatieRef } from '@/lib/types'

interface Props {
  type: 'leverancier' | 'onderaannemer'
  relatieId?: string
  relatieNaam?: string
  onSelecteer: (id: string, naam: string) => void
  onWis: () => void
}

export default function RelatieZoekveld({ type, relatieId, relatieNaam, onSelecteer, onWis }: Props) {
  const [zoekterm, setZoekterm] = useState('')
  const [resultaten, setResultaten] = useState<RelatieRef[]>([])
  const [isZoeken, setIsZoeken] = useState(false)
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const zoek = useCallback(async (term: string) => {
    if (term.length < 2) { setResultaten([]); return }
    setIsZoeken(true)
    try {
      const res = await zoekRelaties(term, type)
      setResultaten(res)
    } finally {
      setIsZoeken(false)
    }
  }, [type])

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setZoekterm(val)
    setOpen(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => zoek(val), 300)
  }

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  if (relatieId && relatieNaam) {
    return (
      <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-everts-50/60 border border-everts/20 max-w-full">
        <span className="text-xs text-everts truncate flex-1 min-w-0">{relatieNaam}</span>
        <button
          onClick={onWis}
          className="flex-shrink-0 text-everts/50 hover:text-everts transition-colors"
        >
          <X className="w-2.5 h-2.5" />
        </button>
      </div>
    )
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-1">
        <Search className="flex-shrink-0 w-2.5 h-2.5 text-slate-300" />
        <input
          ref={inputRef}
          className="flex-1 min-w-0 text-xs px-1 py-0.5 rounded border-0 bg-transparent hover:bg-white hover:border hover:border-slate-200 focus:bg-white focus:border focus:border-slate-300 focus:outline-none text-slate-600 placeholder:text-slate-300"
          value={zoekterm}
          placeholder={type === 'leverancier' ? 'Leverancier...' : 'Onderaannemer...'}
          onChange={handleInput}
          onFocus={() => zoekterm.length >= 2 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {isZoeken && <Loader2 className="flex-shrink-0 w-2.5 h-2.5 text-slate-400 animate-spin" />}
      </div>

      {open && resultaten.length > 0 && (
        <div className="absolute left-0 top-full mt-0.5 w-56 bg-white border border-slate-200 rounded-lg shadow-lg z-50 py-1 max-h-40 overflow-y-auto">
          {resultaten.map(r => (
            <button
              key={r.id}
              className="w-full text-left px-3 py-1.5 hover:bg-everts-50 transition-colors"
              onMouseDown={() => {
                onSelecteer(r.id, r.naam)
                setZoekterm('')
                setOpen(false)
              }}
            >
              <p className="text-xs font-medium text-slate-700 truncate">{r.naam}</p>
              {r.email && <p className="text-[10px] text-slate-400 truncate">{r.email}</p>}
            </button>
          ))}
        </div>
      )}

      {open && !isZoeken && zoekterm.length >= 2 && resultaten.length === 0 && (
        <div className="absolute left-0 top-full mt-0.5 w-48 bg-white border border-slate-200 rounded-lg shadow-lg z-50 px-3 py-2">
          <p className="text-xs text-slate-400">Geen resultaten gevonden</p>
        </div>
      )}
    </div>
  )
}
