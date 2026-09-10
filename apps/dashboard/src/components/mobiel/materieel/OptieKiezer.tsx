'use client'

import React from 'react'
import type { Optie } from '@/lib/materieel/types'
import { GRIJS, OPPERVLAK, RAND, veld } from './stijl'

/**
 * Keuzelijst met zoekveld voor de telefoon.
 *
 * Vervangt de gewone `<select>` op de plekken waar een collega of een team
 * gekozen wordt. Reden: die lijst is inmiddels vijftig namen lang, en de
 * ingebouwde keuzelijst van iOS en Android laat je daar alleen doorheen
 * scrollen — met handschoenen aan, staand in een bus. Typen is sneller: twee
 * letters van een achternaam en je bent er.
 *
 * Er wordt gezocht op elk woord in de naam, niet alleen op het begin: "kamminga"
 * en "tom" vinden allebei dezelfde persoon.
 *
 * Bewust géén onderdeel hiervan: wat de gekozen waarde betekent. De aanroeper
 * levert de groepen aan en krijgt een id terug.
 */
export type OptieGroep = { label: string; opties: Optie[] }

export default function OptieKiezer({
  waarde,
  onKies,
  groepen,
  /** Optie die bovenaan staat en niet in een groep hoort, bijv. "Algemeen gebruik". */
  vaste,
  plaatshouder = 'Kies…',
  zoekPlaatshouder = 'Typ om te zoeken',
  id,
}: {
  /** Gekozen id, of '' als er (nog) niets gekozen is. */
  waarde: string
  onKies: (id: string) => void
  groepen: OptieGroep[]
  vaste?: Optie
  plaatshouder?: string
  zoekPlaatshouder?: string
  id?: string
}) {
  const [open, setOpen] = React.useState(false)
  const [term, setTerm] = React.useState('')
  const zoekRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => { if (open) zoekRef.current?.focus() }, [open])

  const alle = React.useMemo(
    () => [...(vaste ? [vaste] : []), ...groepen.flatMap((g) => g.opties)],
    [groepen, vaste],
  )
  const gekozen = alle.find((o) => o.id === waarde) ?? null

  const woorden = term.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const past = (naam: string) => {
    const kleine = naam.toLowerCase()
    return woorden.every((w) => kleine.includes(w))
  }

  const zichtbaar = groepen
    .map((g) => ({ ...g, opties: g.opties.filter((o) => past(o.naam)) }))
    .filter((g) => g.opties.length > 0)
  const vasteZichtbaar = vaste && past(vaste.naam) ? vaste : null
  const leeg = zichtbaar.length === 0 && !vasteZichtbaar

  function kies(optieId: string) {
    onKies(optieId)
    setOpen(false)
    setTerm('')
  }

  if (!open) {
    return (
      <button
        type="button"
        id={id}
        onClick={() => setOpen(true)}
        style={{
          ...veld, textAlign: 'left', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          color: gekozen ? 'var(--fg)' : GRIJS,
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {gekozen ? gekozen.naam : plaatshouder}
        </span>
        <span aria-hidden style={{ color: GRIJS, flexShrink: 0 }}>▾</span>
      </button>
    )
  }

  return (
    <div style={{ border: `1px solid ${RAND}`, borderRadius: 10, background: OPPERVLAK, overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 8, padding: 8, borderBottom: `1px solid ${RAND}` }}>
        <input
          ref={zoekRef}
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder={zoekPlaatshouder}
          type="search"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          style={{ ...veld, flex: 1 }}
        />
        <button
          type="button"
          onClick={() => { setOpen(false); setTerm('') }}
          style={{
            padding: '0 12px', borderRadius: 10, border: `1px solid ${RAND}`,
            background: 'var(--bg)', color: GRIJS, fontSize: 14, fontWeight: 600,
            cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
          }}
        >
          Sluit
        </button>
      </div>

      <div style={{ maxHeight: 260, overflowY: 'auto' }}>
        {vasteZichtbaar && (
          <Regel optie={vasteZichtbaar} gekozen={waarde === vasteZichtbaar.id} onKies={kies} />
        )}
        {zichtbaar.map((groep) => (
          <div key={groep.label}>
            <div style={{
              padding: '8px 12px 4px', fontSize: 11, fontWeight: 700, color: GRIJS,
              textTransform: 'uppercase', letterSpacing: '.04em',
            }}>
              {groep.label}
            </div>
            {groep.opties.map((o) => (
              <Regel key={o.id} optie={o} gekozen={waarde === o.id} onKies={kies} />
            ))}
          </div>
        ))}
        {leeg && (
          <div style={{ padding: 14, fontSize: 14, color: GRIJS }}>Niets gevonden.</div>
        )}
      </div>
    </div>
  )
}

function Regel({
  optie, gekozen, onKies,
}: {
  optie: Optie
  gekozen: boolean
  onKies: (id: string) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onKies(optie.id)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        width: '100%', textAlign: 'left', padding: '11px 12px',
        border: 'none', borderTop: `1px solid ${RAND}`, background: 'transparent',
        color: 'var(--fg)', font: 'inherit', fontSize: 15,
        fontWeight: gekozen ? 700 : 400,
        cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
      }}
    >
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{optie.naam}</span>
      {gekozen && <span aria-hidden style={{ color: '#009439', flexShrink: 0 }}>✓</span>}
    </button>
  )
}
