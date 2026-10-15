'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { getActieveMaterialen } from '@/app/(platform)/everts-calc/actions/materialen'
import { formatEuro } from '@/lib/everts-calc/calculations'
import type { Componentregel, Eenheid, Materiaal } from '@/lib/everts-calc/types'
import { cn } from '@/lib/everts-calc/utils'
import { ZwevendeLijst } from '@/components/ui/zwevende-lijst'

/** De materialenbibliotheek, één keer per sessie geladen en gedeeld door alle normregels. */
let materialenBelofte: Promise<Materiaal[]> | null = null
function laadMaterialen(): Promise<Materiaal[]> {
  materialenBelofte ??= getActieveMaterialen().catch(() => { materialenBelofte = null; return [] })
  return materialenBelofte
}

function zoekMaterialen(alle: Materiaal[], term: string): Materiaal[] {
  const t = term.trim().toLowerCase()
  if (t.length < 2) return []
  const woorden = t.split(/\s+/)
  return alle.filter(m => {
    const hooi = `${m.omschrijving} ${m.artikelnummer ?? ''} ${m.leverancier ?? ''} ${m.merk ?? ''}`.toLowerCase()
    return woorden.every(w => hooi.includes(w))
  }).slice(0, 12)
}

const SOORTEN: { type: Componentregel['type']; kort: string; naam: string; kleur: string }[] = [
  { type: 'arbeid',         kort: 'A',  naam: 'Arbeid',         kleur: 'text-blue-600 border-blue-300 data-[aan=true]:bg-blue-600' },
  { type: 'materieel',      kort: 'M',  naam: 'Materiaal',      kleur: 'text-pink-700 border-pink-300 data-[aan=true]:bg-pink-700' },
  { type: 'onderaanneming', kort: 'OA', naam: 'Onderaanneming', kleur: 'text-purple-700 border-purple-300 data-[aan=true]:bg-purple-700' },
]

/**
 * Lege normregel onder de normen: kies A, M of OA, typ de omschrijving en Enter.
 * Daarna staat de cursor in de hoeveelheid van de nieuwe norm. Bij M zoekt hij
 * meteen in de materialenbibliotheek: ↓ en Enter nemen een artikel over met prijs,
 * eenheid en leverancier; Enter zonder keuze maakt een vrije norm.
 */
export function NieuweNormInvoer({ onVoeg }: {
  onVoeg: (type: Componentregel['type'], omschrijving: string, extra?: Partial<Componentregel>) => void
}) {
  const [type, setType] = useState<Componentregel['type']>('arbeid')
  const [tekst, setTekst] = useState('')
  const [materialen, setMaterialen] = useState<Materiaal[]>([])
  const [actief, setActief] = useState(-1)
  const [lijstOpen, setLijstOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const soort = SOORTEN.find(s => s.type === type)!

  // Vooraf laden zodra de normen open staan: anders is de lijst er bij de eerste
  // letters nog niet en wordt Enter een vrije norm. Eén keer per sessie (gecachet).
  useEffect(() => { void laadMaterialen().then(setMaterialen) }, [])
  const treffers = useMemo(
    () => (type === 'materieel' ? zoekMaterialen(materialen, tekst) : []),
    [type, materialen, tekst],
  )

  const neemOver = (m: Materiaal) => {
    onVoeg('materieel', m.omschrijving, {
      tarief: m.kostprijs,
      eenheid: (m.eenheid || undefined) as Eenheid | undefined,
      leverancier: m.leverancier,
    })
    setTekst(''); setActief(-1); setLijstOpen(false)
  }
  return (
    <div className="flex flex-1 items-center gap-1.5 min-w-0">
      {SOORTEN.map(s => (
        <button
          key={s.type}
          type="button"
          data-aan={s.type === type}
          onClick={() => setType(s.type)}
          title={`Nieuwe norm: ${s.naam.toLowerCase()}`}
          aria-pressed={s.type === type}
          className={cn(
            'inline-flex h-5 min-w-[22px] items-center justify-center rounded border bg-white px-1 text-[10px] font-bold transition-colors data-[aan=true]:text-white',
            s.kleur,
          )}
        >
          {s.kort}
        </button>
      ))}
      <ZwevendeLijst
        open={lijstOpen && treffers.length > 0}
        onSluit={() => setLijstOpen(false)}
        breedte={520}
        className="py-1"
        anker={
          <input
            ref={inputRef}
            value={tekst}
            onChange={e => { setTekst(e.target.value); setActief(-1); setLijstOpen(true) }}
            onBlur={() => setTimeout(() => setLijstOpen(false), 150)}
            onKeyDown={e => {
              if (treffers.length > 0 && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
                e.preventDefault(); e.stopPropagation()
                setLijstOpen(true)
                setActief(i => e.key === 'ArrowDown' ? Math.min(i + 1, treffers.length - 1) : Math.max(i - 1, -1))
                return
              }
              if (e.key === 'Escape' && lijstOpen) { e.stopPropagation(); setLijstOpen(false); return }
              if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
                e.preventDefault()
                if (lijstOpen && actief >= 0 && treffers[actief]) { neemOver(treffers[actief]); return }
                onVoeg(type, tekst.trim())
                setTekst(''); setActief(-1)
              }
            }}
            placeholder={type === 'materieel'
              ? 'Nieuwe norm (materiaal): zoek in de bibliotheek of typ een omschrijving en druk op Enter'
              : `Nieuwe norm (${soort.naam.toLowerCase()}): typ een omschrijving en druk op Enter`}
            className="w-full max-w-md text-xs px-2 py-0.5 rounded border border-transparent bg-transparent hover:border-neutral-200 focus:bg-white focus:border-brand-500/40 focus:outline-none placeholder-neutral-400"
          />
        }
      >
        {treffers.map((m, i) => (
          <button
            key={m.id}
            type="button"
            onMouseDown={e => { e.preventDefault(); neemOver(m) }}
            onMouseEnter={() => setActief(i)}
            className={cn('flex w-full items-baseline gap-2 px-3 py-1.5 text-left', i === actief ? 'bg-brand-50' : 'hover:bg-neutral-50')}
          >
            <span className="flex-1 min-w-0 truncate text-xs text-neutral-800">{m.omschrijving}</span>
            <span className="flex-shrink-0 text-[10.5px] text-neutral-500">
              {[m.leverancier, m.eenheid].filter(Boolean).join(' · ')}
            </span>
            <span className="flex-shrink-0 font-mono text-[11px] font-semibold tabular-nums text-neutral-800">{formatEuro(m.kostprijs)}</span>
          </button>
        ))}
      </ZwevendeLijst>
    </div>
  )
}
