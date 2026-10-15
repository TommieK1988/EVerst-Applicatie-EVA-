'use client'

import { useState, useEffect, useRef } from 'react'
import { formatGetal, parseGetal } from '@/lib/everts-calc/calculations'

// ─── GetalInput ───────────────────────────────────────────────────────────────

/**
 * Numeriek invoerveld met Nederlandse opmaak: buiten focus zie je `12.345,67`,
 * bij het bewerken het kale getal zodat typen niet vecht met de scheidingstekens.
 *
 * Bewust `type="text"` — een `<input type="number">` kan geen duizendteken tonen.
 * De parser accepteert zowel komma als punt als decimaalteken (zie `parseGetal`).
 */
export function GetalInput({
  waarde, onChange, decimalen = 2, className, title, onDoubleClick,
}: {
  waarde: number
  onChange: (v: number) => void
  decimalen?: number
  className?: string
  title?: string
  onDoubleClick?: (e: React.MouseEvent) => void
}) {
  const [edit, setEdit] = useState<string | null>(null)
  const inputRef   = useRef<HTMLInputElement>(null)
  const selecteren = useRef(false)
  const toon = edit !== null
    ? edit
    : waarde === 0 ? '' : formatGetal(waarde, decimalen)

  // Bij focus de hele inhoud selecteren, zodat typen de bestaande waarde meteen vervangt
  // (anders moet je die eerst weghalen). Dat moet ná de commit: focus wisselt de weergave van
  // opgemaakt ("1.234,50") naar ruw ("1234.5"), en die waardewissel wist elke selectie.
  useEffect(() => {
    if (selecteren.current && edit !== null) {
      selecteren.current = false
      inputRef.current?.select()
    }
  }, [edit])

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="decimal"
      value={toon}
      className={className}
      title={title}
      onDoubleClick={onDoubleClick}
      onFocus={() => {
        selecteren.current = true
        setEdit(waarde === 0 ? '' : String(+waarde.toFixed(decimalen)))
      }}
      onChange={e => { setEdit(e.target.value); onChange(parseGetal(e.target.value)) }}
      onBlur={() => { selecteren.current = false; setEdit(null) }}
    />
  )
}
