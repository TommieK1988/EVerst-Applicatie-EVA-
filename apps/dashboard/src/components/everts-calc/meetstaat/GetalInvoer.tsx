'use client'

import { useEffect, useState, forwardRef } from 'react'
import { isGetalInTyping, leesGetal, toonGetal } from '@/lib/everts-calc/getal-invoer'

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: number | undefined
  onChange: (waarde: number | undefined) => void
}

/**
 * Tekstveld voor een getal met een Nederlandse komma. Houdt zelf bij wat je typt
 * ('2,' blijft '2,' tot je verder typt), geeft het getal door, en zet de weergave
 * pas recht als je het veld verlaat of de waarde van buitenaf verandert.
 */
const GetalInvoer = forwardRef<HTMLInputElement, Props>(function GetalInvoer(
  { value, onChange, onBlur, ...rest }, ref,
) {
  const [tekst, setTekst] = useState(toonGetal(value))

  // Van buitenaf gewijzigd (andere regel, element ingevoegd): volgen. Niet als het
  // getypte al hetzelfde getal is, anders springt '2,' terug naar '2'.
  useEffect(() => {
    setTekst(huidig => (leesGetal(huidig) ?? 0) === (value ?? 0) ? huidig : toonGetal(value))
  }, [value])

  return (
    <input
      ref={ref}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={tekst}
      onChange={e => {
        const t = e.target.value
        if (!isGetalInTyping(t)) return
        setTekst(t)
        onChange(leesGetal(t))
      }}
      onBlur={e => { setTekst(toonGetal(leesGetal(tekst))); onBlur?.(e) }}
      {...rest}
    />
  )
})

export default GetalInvoer
