'use client'

import React from 'react'
import { KWALITEIT_LOCATIE_SUGGESTIES } from '@everts/database/kwaliteit-types'
import { GRIJS, GROEN, label, RAND, TEKST, veld } from './stijl'

/**
 * Locatie van een bevinding: aantikken of zelf typen.
 *
 * Er wordt op discipline geselecteerd, niet op locatie — de locatie hoort bij de bevinding. In de
 * praktijk lopen meerdere bevindingen op dezelfde gevel, dus de laatst gebruikte locatie staat
 * vooraan. Dat scheelt op een ronde met vijftien bevindingen een hoop getik.
 */
export default function LocatieKiezer({
  waarde,
  onChange,
  recent = [],
}: {
  waarde: string
  onChange: (waarde: string) => void
  /** Eerder in deze ronde gebruikte locaties; komen vooraan te staan. */
  recent?: string[]
}) {
  const suggesties = React.useMemo(() => {
    const uniek = new Set<string>()
    const lijst: string[] = []
    for (const s of [...recent, ...KWALITEIT_LOCATIE_SUGGESTIES]) {
      const sleutel = s.toLowerCase()
      if (uniek.has(sleutel)) continue
      uniek.add(sleutel)
      lijst.push(s)
    }
    return lijst
  }, [recent])

  return (
    <div>
      <label style={label}>Locatie *</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        {suggesties.slice(0, 12).map(s => {
          const actief = waarde.trim().toLowerCase() === s.toLowerCase()
          return (
            <button
              key={s}
              type="button"
              onClick={() => onChange(actief ? '' : s)}
              style={{
                padding: '7px 11px', borderRadius: 999, fontSize: 13, fontWeight: 600,
                border: `1px solid ${actief ? GROEN : RAND}`,
                background: actief ? GROEN : 'transparent',
                color: actief ? '#fff' : GRIJS,
                cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
              }}
            >
              {s}
            </button>
          )
        })}
      </div>
      <input
        value={waarde}
        onChange={e => onChange(e.target.value)}
        placeholder="Of typ een locatie, bijv. Woningen 21 t/m 28"
        style={{ ...veld, color: TEKST }}
      />
    </div>
  )
}
