'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { Spinner } from '@/components/ui'
import { ZwevendeLijst } from '@/components/ui/zwevende-lijst'
import type { RelatieRef } from '@/lib/everts-calc/types'
import type { UitvraagPartijKeuze } from '@/lib/dossiers/uitvraag-pakket-types'

/**
 * Meerdere partijen kiezen: elke gekozen partij als chip, met een zoekveld erachter. Werkt
 * als PartijKiezer (300 ms debounce, zoeken vanaf twee tekens), maar houdt een lijst bij in
 * plaats van één keuze. Het zoeken komt via een prop, zodat de preview zonder server kan.
 */
export function PartijChips({ partijen, onWijzig, zoek, disabled, placeholder = '+ Onderaannemer zoeken…' }: {
  partijen: UitvraagPartijKeuze[]
  onWijzig: (partijen: UitvraagPartijKeuze[]) => void
  zoek: (term: string) => Promise<RelatieRef[]>
  disabled?: boolean
  placeholder?: string
}) {
  const [term, setTerm] = useState('')
  const [resultaten, setResultaten] = useState<RelatieRef[]>([])
  const [bezig, setBezig] = useState(false)
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const zoekNu = useCallback(async (t: string) => {
    if (t.trim().length < 2) { setResultaten([]); return }
    setBezig(true)
    try { setResultaten(await zoek(t.trim())) } catch { setResultaten([]) } finally { setBezig(false) }
  }, [zoek])

  const gekozenIds = new Set(partijen.map(p => p.relatie_id).filter(Boolean))
  const voegToe = (p: UitvraagPartijKeuze) => {
    const dubbel = partijen.some(x => (p.relatie_id ? x.relatie_id === p.relatie_id : x.naam.toLowerCase() === p.naam.toLowerCase()))
    if (!dubbel) onWijzig([...partijen, p])
    setTerm(''); setResultaten([]); setOpen(false)
  }
  const beschikbaar = resultaten.filter(r => !gekozenIds.has(r.id))
  const toonLijst = open && term.trim().length >= 2 && !bezig

  return (
    <div className="flex flex-wrap items-center gap-2">
      {partijen.map((p, i) => (
        <span
          key={`${p.relatie_id ?? p.naam}-${i}`}
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-calc-oa/30 bg-calc-oa/5 pl-3 pr-2 text-[13px] font-semibold text-calc-oa"
        >
          {p.naam}
          {!disabled && (
            <button
              type="button" title={`${p.naam} weghalen`}
              onClick={() => onWijzig(partijen.filter((_, j) => j !== i))}
              className="grid h-4 w-4 place-items-center rounded-full hover:bg-calc-oa/10"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </span>
      ))}
      <ZwevendeLijst
        open={toonLijst}
        onSluit={() => setOpen(false)}
        breedte={288}
        className="py-1"
        anker={
          <div className="flex h-8 w-56 items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-2.5 focus-within:border-brand-500 focus-within:ring-[3px] focus-within:ring-brand-100">
            <input
              className="min-w-0 flex-1 bg-transparent text-[13px] text-neutral-900 outline-none placeholder:text-neutral-400"
              value={term}
              disabled={disabled}
              placeholder={placeholder}
              onChange={e => {
                const v = e.target.value
                setTerm(v); setOpen(true)
                if (timer.current) clearTimeout(timer.current)
                timer.current = setTimeout(() => zoekNu(v), 300)
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); if (beschikbaar[0]) voegToe({ relatie_id: beschikbaar[0].id, naam: beschikbaar[0].naam }) }
                if (e.key === 'Backspace' && !term && partijen.length > 0) onWijzig(partijen.slice(0, -1))
              }}
              onFocus={() => term.trim().length >= 2 && setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
            />
            {bezig && <Spinner size="sm" className="flex-shrink-0" />}
          </div>
        }
      >
        {beschikbaar.map(r => (
          <button
            key={r.id} type="button" className="w-full px-3 py-1.5 text-left hover:bg-neutral-50"
            onMouseDown={() => voegToe({ relatie_id: r.id, naam: r.naam })}
          >
            <p className="truncate text-[12.5px] font-medium text-neutral-800">{r.naam}</p>
            {r.email
              ? <p className="truncate text-[11px] text-neutral-400">{r.email}</p>
              : <p className="text-[11px] text-warning-700">Geen e-mailadres bekend</p>}
          </button>
        ))}
        {beschikbaar.length === 0 && (
          <p className="px-3 py-1 text-[12px] text-neutral-500">Geen actieve onderaannemer gevonden.</p>
        )}
        <button
          type="button" className="w-full border-t border-neutral-100 px-3 py-1.5 text-left text-[12px] text-neutral-600 hover:bg-neutral-50"
          onMouseDown={() => voegToe({ relatie_id: null, naam: term.trim() })}
          title="Partij die (nog) niet in het adresboek staat; het e-mailadres vul je in het mailvenster in"
        >
          &ldquo;{term.trim()}&rdquo; toevoegen zonder adresboek
        </button>
      </ZwevendeLijst>
    </div>
  )
}
