'use client'

import React from 'react'
import { zoekAlMaterieel } from '@/app/m/materieel/actions'
import type { MaterieelTreffer } from '@/lib/materieel/zoeken'
import MaterieelRegel from './MaterieelRegel'
import { GRIJS, RAND, ROOD, veld } from './stijl'

/**
 * Zoekveld op het beginscherm van materieel.
 *
 * Zoekt over álle velden die op een regel te zien zijn: omschrijving, merk,
 * type, soort, status, serienummer, keurings- of inventarisnummer en de naam
 * waar het op staat. Dat is precies wat er op het gereedschap zelf staat — een
 * monteur met een boormachine in zijn hand leest daar "Makita" en een
 * serienummer, geen omschrijving zoals kantoor die typte.
 *
 * Zoeken gebeurt op de server: er staan honderden stuks in en die lijst hoort
 * niet in zijn geheel over een bouwverbinding te gaan. Vanaf twee tekens, met
 * een korte typepauze ertussen, zodat het één query per woord blijft.
 *
 * De gewone lijsten van het beginscherm ("Op mijn naam", "Nog geen sticker")
 * komen als `children` binnen en staan in beeld zolang er niet gezocht wordt.
 * Tijdens het zoeken maken ze plaats voor de treffers — anders sta je op een
 * telefoon langs twee lijsten te scrollen om te zien welke de jouwe is.
 */
export default function MaterieelZoek({ children }: { children?: React.ReactNode }) {
  const [term, setTerm] = React.useState('')
  const [treffers, setTreffers] = React.useState<MaterieelTreffer[] | null>(null)
  const [zoekt, setZoekt] = React.useState(false)
  const [fout, setFout] = React.useState<string | null>(null)

  const schoon = term.trim()

  React.useEffect(() => {
    if (schoon.length < 2) { setTreffers(null); setFout(null); setZoekt(false); return }
    let afgebroken = false
    setZoekt(true)
    const timer = setTimeout(async () => {
      const res = await zoekAlMaterieel(schoon)
      if (afgebroken) return
      if (res.ok) { setTreffers(res.data); setFout(null) } else { setFout(res.error) }
      setZoekt(false)
    }, 250)
    return () => { afgebroken = true; clearTimeout(timer) }
  }, [schoon])

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ position: 'relative' }}>
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Zoek op naam, merk, nummer of wie het heeft"
          type="search"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          style={veld}
        />
        {schoon.length > 0 && (
          <button
            type="button"
            onClick={() => setTerm('')}
            aria-label="Zoekterm wissen"
            style={{
              position: 'absolute', right: 6, top: 6, bottom: 6, width: 36,
              border: 'none', background: 'transparent', color: GRIJS,
              fontSize: 18, cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
            }}
          >
            ×
          </button>
        )}
      </div>

      {fout && (
        <div style={{
          marginTop: 10, padding: 12, borderRadius: 10, border: `1px solid ${RAND}`,
          background: 'rgba(180,35,24,.06)', color: ROOD, fontSize: 14, lineHeight: 1.45,
        }}>
          {fout}
        </div>
      )}

      {treffers === null && !fout && children}

      {treffers !== null && !fout && (
        <div style={{ marginTop: 12 }}>
          <div style={{
            fontSize: 12, fontWeight: 700, color: GRIJS, textTransform: 'uppercase',
            letterSpacing: '.04em', marginBottom: 8,
          }}>
            {zoekt ? 'Zoeken…' : `Gevonden (${treffers.length}${treffers.length === 50 ? '+' : ''})`}
          </div>
          {treffers.length === 0 && !zoekt ? (
            <div style={{ fontSize: 14, color: GRIJS, lineHeight: 1.5 }}>
              Niets gevonden voor &ldquo;{schoon}&rdquo;.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {treffers.map((o) => (
                <MaterieelRegel
                  key={o.id}
                  object={o}
                  fotoUrl={o.foto_url}
                  href={`/m/materieel/${o.id}`}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
