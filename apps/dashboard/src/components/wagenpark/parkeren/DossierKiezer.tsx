'use client'

import { useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { zoekDossiers } from '@/lib/dossiers/actions'

/**
 * Zoekveld om zelf een dossier te kiezen voor een parkeerkost.
 *
 * Zoekt op de bestaande `zoekDossiers()` zodat er niet nóg een dossierzoeker
 * naast komt te staan. Toont het voorstel van de engine als beginwaarde; wie
 * niets aanpast, bevestigt dat voorstel.
 */
export default function DossierKiezer({
  huidigLabel,
  onKies,
}: {
  huidigLabel: string | null
  onKies: (d: { id: string; label: string }) => void
}) {
  const [open, setOpen] = useState(false)
  const [term, setTerm] = useState('')
  const [resultaten, setResultaten] = useState<
    { id: string; titel: string; klant_naam: string | null }[]
  >([])
  const [bezig, setBezig] = useState(false)
  const wrapper = useRef<HTMLDivElement>(null)

  // Zoeken pas na een korte pauze: elke toetsaanslag een server action aanroepen
  // levert een reeks calls op waarvan alleen de laatste ertoe doet.
  useEffect(() => {
    if (!open) return
    const t = term.trim()
    if (t.length < 2) {
      setResultaten([])
      return
    }
    let afgebroken = false
    setBezig(true)
    const timer = setTimeout(async () => {
      try {
        const res = await zoekDossiers(t, 8)
        if (!afgebroken) setResultaten(res)
      } finally {
        if (!afgebroken) setBezig(false)
      }
    }, 250)
    return () => {
      afgebroken = true
      clearTimeout(timer)
    }
  }, [term, open])

  useEffect(() => {
    if (!open) return
    const buiten = (e: MouseEvent) => {
      if (wrapper.current && !wrapper.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', buiten)
    return () => document.removeEventListener('mousedown', buiten)
  }, [open])

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-left w-full truncate hover:underline"
        title={huidigLabel ?? 'Kies een dossier'}
      >
        {huidigLabel ?? <span className="text-slate-400">Kies een dossier…</span>}
      </button>
    )
  }

  return (
    <div ref={wrapper} className="relative">
      <div className="flex items-center gap-1 rounded border bg-white px-2 py-1">
        <Search className="w-3 h-3 text-slate-400 shrink-0" />
        <input
          autoFocus
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Zoek op nummer of naam…"
          className="w-full text-sm outline-none"
        />
        <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700 shrink-0">
          <X className="w-3 h-3" />
        </button>
      </div>

      {(resultaten.length > 0 || bezig || term.trim().length >= 2) && (
        <div className="absolute z-20 mt-1 w-80 max-h-64 overflow-y-auto rounded-md border bg-white shadow-lg">
          {bezig && <div className="px-3 py-2 text-xs text-slate-400">Zoeken…</div>}
          {!bezig && resultaten.length === 0 && (
            <div className="px-3 py-2 text-xs text-slate-400">Niets gevonden.</div>
          )}
          {resultaten.map((d) => (
            <button
              key={d.id}
              onClick={() => {
                onKies({ id: d.id, label: d.titel })
                setOpen(false)
              }}
              className="block w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
            >
              <div className="truncate">{d.titel}</div>
              {d.klant_naam && <div className="text-xs text-slate-500 truncate">{d.klant_naam}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
