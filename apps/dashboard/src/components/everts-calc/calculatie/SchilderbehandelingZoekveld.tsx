'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { X, Search, PaintBucket } from 'lucide-react'
import { laadBehandelingen } from '@/app/(platform)/everts-calc/actions/schilderwerk'
import type { SchilderBehandeling } from '@/lib/everts-calc/services/schilderwerk'

interface Props {
  behandelingId?: string
  behandelingTekst?: string
  onSelecteer: (b: SchilderBehandeling) => void
  onWis: () => void
}

export default function SchilderbehandelingZoekveld({ behandelingId, behandelingTekst, onSelecteer, onWis }: Props) {
  const [zoekterm, setZoekterm]     = useState('')
  const [resultaten, setResultaten] = useState<SchilderBehandeling[]>([])
  const [open, setOpen]             = useState(false)
  const [alle, setAlle]             = useState<SchilderBehandeling[] | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const ladenRef = useRef(false)

  // Behandelingen-bibliotheek één keer (lazy) laden, daarna client-side filteren.
  const zorgGeladen = useCallback(async (): Promise<SchilderBehandeling[]> => {
    if (alle) return alle
    if (ladenRef.current) return []
    ladenRef.current = true
    try {
      const lijst = await laadBehandelingen()
      setAlle(lijst)
      return lijst
    } catch {
      setAlle([])
      return []
    }
  }, [alle])

  const zoek = useCallback(async (term: string) => {
    if (term.length < 1) { setResultaten([]); return }
    const t = term.toLowerCase()
    const lijst = alle ?? await zorgGeladen()
    setResultaten(
      lijst
        .filter(b =>
          b.naam.toLowerCase().includes(t) ||
          (b.code ?? '').toLowerCase().includes(t)
        )
        .slice(0, 20)
    )
  }, [alle, zorgGeladen])

  // Vast laden zodra het veld in beeld komt (chip-lookup + eerste toetsaanslag).
  useEffect(() => { void zorgGeladen() }, [zorgGeladen])

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setZoekterm(val)
    setOpen(true)
    zoek(val)
  }

  // Chip tonen als er een behandeling gekozen is
  if (behandelingId || behandelingTekst) {
    const gekozen = alle?.find(b => b.id === behandelingId)
    const label = gekozen ? gekozen.naam : 'Behandeling gekozen'
    return (
      <div className="flex items-start gap-2">
        <PaintBucket className="w-3.5 h-3.5 text-blue-500 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0 rounded bg-blue-50/60 border border-blue-200/60 px-2 py-1">
          <div className="flex items-center gap-1.5">
            {gekozen?.code && (
              <span className="text-[10px] font-semibold text-blue-600 bg-blue-100/70 rounded px-1 py-0.5 flex-shrink-0">{gekozen.code}</span>
            )}
            <span className="text-xs font-medium text-blue-800 truncate flex-1 min-w-0" title={label}>{label}</span>
            <button
              onClick={onWis}
              className="flex-shrink-0 p-0.5 text-blue-400/70 hover:text-red-500 rounded transition-colors"
              title="Behandeling verwijderen"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          {behandelingTekst && (
            <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-3 whitespace-pre-wrap" title={behandelingTekst}>
              {behandelingTekst}
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex-1">
      <div className="flex items-center gap-2">
        <PaintBucket className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-300 pointer-events-none" />
          <input
            ref={inputRef}
            className="w-full text-xs pl-7 pr-2 py-1.5 rounded border border-blue-200 bg-white
              focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100
              text-slate-700 placeholder:text-slate-300"
            value={zoekterm}
            placeholder="Behandeling zoeken in bibliotheek (naam of code)…"
            onChange={handleInput}
            onFocus={() => zoekterm.length >= 1 && setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
          />
        </div>
      </div>

      {open && resultaten.length > 0 && (
        <div className="absolute left-0 top-full mt-0.5 w-96 max-w-[90vw] bg-white border border-slate-200 rounded-lg shadow-lg z-50 py-1 max-h-64 overflow-y-auto">
          {resultaten.map(b => (
            <button
              key={b.id}
              className="w-full text-left px-3 py-1.5 hover:bg-blue-50 transition-colors border-b border-slate-50 last:border-0"
              title={b.uitgebreide_werkomschrijving ?? b.korte_omschrijving ?? undefined}
              onMouseDown={() => { onSelecteer(b); setZoekterm(''); setOpen(false) }}
            >
              <p className="text-xs font-medium text-slate-700 truncate">
                {b.code && <span className="text-[10px] font-semibold text-blue-600 mr-1">{b.code}</span>}
                {b.naam}
              </p>
              {(b.korte_omschrijving || b.uitgebreide_werkomschrijving) && (
                <p className="text-[10px] text-slate-400 truncate">
                  {b.korte_omschrijving || b.uitgebreide_werkomschrijving}
                </p>
              )}
            </button>
          ))}
        </div>
      )}

      {open && zoekterm.length >= 1 && resultaten.length === 0 && (
        <div className="absolute left-0 top-full mt-0.5 w-72 bg-white border border-slate-200 rounded-lg shadow-lg z-50 px-3 py-2">
          <p className="text-xs text-slate-400">Geen behandelingen gevonden</p>
          <p className="text-[10px] text-slate-300 mt-0.5">Voeg behandelingen toe via de bibliotheek (Schilderwerk)</p>
        </div>
      )}
    </div>
  )
}
