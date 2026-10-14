'use client'

import { useState, useEffect, useRef } from 'react'

// ─── OmschrijvingVeld ─────────────────────────────────────────────────────────

/**
 * Invoerveld voor de omschrijving dat naar rechts uitschuift zodra de tekst niet
 * meer in de kolom past, zodat je de hele regel kunt lezen én bewerken.
 *
 * Het veld wordt tijdens het bewerken absoluut gepositioneerd binnen zijn eigen
 * wikkel; de wikkel houdt zijn plek in de flexrij (met de gemeten hoogte), zodat
 * de knoppen erachter niet verspringen.
 */
export function OmschrijvingVeld({
  waarde, onWijzig, italic,
}: {
  waarde: string
  onWijzig: (v: string) => void
  italic?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const meetRef  = useRef<HTMLSpanElement>(null)
  /** Maten van vóór het uitschuiven — daarna staat het veld buiten de flow en
   *  zou een nieuwe meting de wikkel laten meegroeien (en blijven groeien). */
  const basisRef = useRef<{ w: number; h: number } | null>(null)
  const [gefocust,  setGefocust]  = useState(false)
  const [uitschuif, setUitschuif] = useState<number | null>(null)

  useEffect(() => {
    if (!gefocust) { setUitschuif(null); return }
    const basis = basisRef.current, meet = meetRef.current
    if (!basis || !meet) return
    const nodig = meet.offsetWidth + 18   // padding + ruimte voor de cursor
    setUitschuif(nodig > basis.w ? Math.min(nodig, 900) : null)
  }, [gefocust, waarde])

  const veldCls = `text-xs px-1 py-1 rounded border bg-transparent border-transparent
    hover:bg-slate-50 hover:border-slate-200
    focus:bg-white focus:border-everts/40 focus:outline-none text-slate-800 ${italic ? 'italic' : ''}`

  const basis = basisRef.current

  return (
    <div
      className="relative flex-1 min-w-0"
      style={uitschuif && basis ? { width: basis.w, height: basis.h, flex: 'none', zIndex: 40 } : undefined}
    >
      <input
        ref={inputRef}
        className={`w-full ${veldCls} ${uitschuif ? 'shadow-md' : ''}`}
        style={uitschuif ? { position: 'absolute', left: 0, top: 0, width: uitschuif, backgroundColor: '#fff' } : undefined}
        value={waarde}
        placeholder="Omschrijving..."
        maxLength={150}
        onFocus={e => {
          const el = e.currentTarget
          basisRef.current = { w: el.offsetWidth, h: el.offsetHeight }
          setGefocust(true)
        }}
        onBlur={() => setGefocust(false)}
        onChange={e => onWijzig(e.target.value)}
      />
      {gefocust && (
        <span
          ref={meetRef}
          aria-hidden
          className={`absolute invisible pointer-events-none whitespace-pre ${veldCls}`}
        >
          {waarde || 'Omschrijving...'}
        </span>
      )}
    </div>
  )
}
