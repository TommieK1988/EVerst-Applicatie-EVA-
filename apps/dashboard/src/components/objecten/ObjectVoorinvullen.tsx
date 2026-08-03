'use client'

/**
 * Objectkiezer in het aanvraagformulier: kies een VvE/complex en het adres, de
 * opdrachtgever en de VvE-code komen mee. Puur voorinvullen — het object legt niets
 * vast wat je daarna niet meer kunt wijzigen.
 */

import React, { useEffect, useState } from 'react'
import type { VastgoedObject } from '@everts/database'
import { objectAdresRegel } from '@/lib/objecten/adres'
import { zoekObjecten, getObjectOpdrachtgeverNaam } from '@/lib/objecten/data'

const labelStijl: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
  letterSpacing: '0.03em', color: 'var(--fg-muted)',
}
const inputStijl: React.CSSProperties = {
  width: '100%', height: 36, padding: '0 10px', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--bg)',
  color: 'var(--fg)', fontFamily: 'var(--font-ui)', fontSize: 14,
}

type Props = {
  gekozen: VastgoedObject | null
  /** Krijgt het object plus de naam van de standaard-opdrachtgever (voor het klantveld). */
  onKies: (object: VastgoedObject, opdrachtgeverNaam: string | null) => void
  onWis: () => void
}

export default function ObjectVoorinvullen({ gekozen, onKies, onWis }: Props) {
  const [term, setTerm] = useState('')
  const [resultaten, setResultaten] = useState<VastgoedObject[]>([])
  const [open, setOpen] = useState(false)
  const [bezig, setBezig] = useState(false)
  const containerRef = React.useRef<HTMLDivElement>(null)

  // Debounce, anders vuurt elke toetsaanslag een server-action af.
  useEffect(() => {
    if (gekozen || !term.trim()) { setResultaten([]); return }
    let afgebroken = false
    setBezig(true)
    const t = setTimeout(async () => {
      try {
        const res = await zoekObjecten(term)
        if (!afgebroken) { setResultaten(res); setOpen(res.length > 0) }
      } finally {
        if (!afgebroken) setBezig(false)
      }
    }, 250)
    return () => { afgebroken = true; clearTimeout(t) }
  }, [term, gekozen])

  // Buiten de combobox klikken sluit de lijst.
  useEffect(() => {
    function bijKlik(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', bijKlik)
    return () => document.removeEventListener('mousedown', bijKlik)
  }, [])

  async function kies(o: VastgoedObject) {
    setOpen(false)
    setResultaten([])
    setTerm('')
    // Naam van de opdrachtgever apart ophalen: het klantveld toont een naam, niet een id.
    let naam: string | null = null
    if (o.standaard_opdrachtgever_id) {
      naam = await getObjectOpdrachtgeverNaam(o.id).catch(() => null)
    }
    onKies(o, naam)
  }

  if (gekozen) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        padding: '10px 12px', borderRadius: 8,
        border: '1.5px solid var(--accent)', background: 'var(--bg-subtle)',
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{gekozen.naam}</div>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
            {gekozen.objectnummer}
            {objectAdresRegel(gekozen) ? ` · ${objectAdresRegel(gekozen)}` : ''}
          </div>
        </div>
        <button
          type="button" onClick={onWis}
          style={{
            border: 'none', background: 'none', cursor: 'pointer',
            fontSize: 12, color: 'var(--fg-muted)', textDecoration: 'underline',
          }}
        >
          Losmaken
        </button>
      </div>
    )
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <div style={labelStijl}>Object (optioneel)</div>
      <input
        type="text"
        value={term}
        onChange={e => setTerm(e.target.value)}
        onFocus={() => resultaten.length > 0 && setOpen(true)}
        placeholder="Zoek een VvE, complex of pand — bv. Complex 1013 of HW1013"
        style={{ ...inputStijl, marginTop: 4 }}
      />
      {bezig && (
        <div style={{ position: 'absolute', right: 10, top: 34, fontSize: 11, color: 'var(--fg-muted)' }}>…</div>
      )}
      <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 4 }}>
        Kies een object en het werkadres, de opdrachtgever en de VvE-code worden ingevuld.
      </div>

      {open && resultaten.length > 0 && (
        <div style={{
          position: 'absolute', top: 62, left: 0, right: 0, zIndex: 100,
          background: 'var(--bg-elev)', border: '1px solid var(--border)',
          borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.16)',
          overflow: 'hidden', marginTop: 2, maxHeight: 240, overflowY: 'auto',
        }}>
          {resultaten.map(o => (
            <button
              key={o.id} type="button" onClick={() => kies(o)}
              style={{
                display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
                padding: '8px 10px', border: 'none', background: 'transparent',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600 }}>{o.naam}</div>
              <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
                {o.objectnummer}{objectAdresRegel(o) ? ` · ${objectAdresRegel(o)}` : ''}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
