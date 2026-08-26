'use client'

import React from 'react'
import { verkleinFoto } from '@/lib/foto/verkleinFoto'
import { uploadKwaliteitFoto, verwijderKwaliteitFoto } from '@/lib/kwaliteit/inspecties'
import type { KwaliteitFotoSoort } from '@everts/database/kwaliteit-types'
import { GRIJS, RAND, ROOD, secundaireKnop, ZACHT } from './stijl'

export type StrookFoto = { id: string; url: string }

/**
 * Foto's maken en tonen bij een bevinding, meting of waarneming.
 *
 * Twee losse inputs, precies zoals `components/mobiel/oplevering/PuntKaart.tsx`: `capture` dwingt
 * de camera af, en zónder een tweede input kun je geen foto uit de bibliotheek meer kiezen. Op een
 * steiger wil je de camera; achteraf op kantoor wil je de bibliotheek.
 *
 * Elke foto gaat eerst door `verkleinFoto` — een onbewerkte telefoonfoto haalt de body-limiet van
 * een server-action niet.
 */
export default function FotoStrook({
  koppelSoort,
  koppelId,
  soort = 'detail',
  fotos,
  onVeranderd,
  verplicht = false,
  compact = false,
}: {
  koppelSoort: 'inspectie' | 'resultaat' | 'afwijking' | 'waarneming'
  koppelId: string
  soort?: KwaliteitFotoSoort
  fotos: StrookFoto[]
  onVeranderd: (fotos: StrookFoto[]) => void
  /** Toont een rode melding zolang er geen foto is. */
  verplicht?: boolean
  compact?: boolean
}) {
  const cameraRef = React.useRef<HTMLInputElement>(null)
  const bibliotheekRef = React.useRef<HTMLInputElement>(null)
  const [bezig, setBezig] = React.useState(false)
  const [fout, setFout] = React.useState<string | null>(null)

  async function verwerk(bestanden: FileList | null) {
    if (!bestanden || bestanden.length === 0) return
    setBezig(true)
    setFout(null)
    const nieuwe: StrookFoto[] = []
    for (const bestand of Array.from(bestanden)) {
      const fd = new FormData()
      fd.append('foto', await verkleinFoto(bestand))
      fd.append('soort', soort)
      fd.append('koppel_soort', koppelSoort)
      fd.append('koppel_id', koppelId)
      const res = await uploadKwaliteitFoto(fd)
      if (res.ok) nieuwe.push({ id: res.id, url: res.url })
      else setFout(res.error)
    }
    if (nieuwe.length > 0) onVeranderd([...fotos, ...nieuwe])
    setBezig(false)
  }

  async function verwijder(id: string) {
    const res = await verwijderKwaliteitFoto(id)
    if (res.ok) onVeranderd(fotos.filter(f => f.id !== id))
    else setFout(res.error)
  }

  const mist = verplicht && fotos.length === 0

  return (
    <div>
      {fotos.length > 0 && (
        // flexShrink: 0 op de tegels is verplicht binnen een overflow-x-strook in de /m-kolom:
        // zonder dat drukt de browser ze plat.
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6, marginBottom: 8 }}>
          {fotos.map(f => (
            <div key={f.id} style={{ position: 'relative', flexShrink: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={f.url}
                alt=""
                style={{
                  width: compact ? 56 : 72, height: compact ? 56 : 72,
                  objectFit: 'cover', borderRadius: 10, border: `1px solid ${RAND}`,
                }}
              />
              <button
                type="button"
                onClick={() => verwijder(f.id)}
                aria-label="Foto verwijderen"
                style={{
                  position: 'absolute', top: -6, right: -6, width: 22, height: 22,
                  borderRadius: 11, border: 'none', background: 'rgba(0,0,0,0.65)',
                  color: '#fff', fontSize: 13, lineHeight: '22px', padding: 0, cursor: 'pointer',
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          disabled={bezig}
          style={{ ...secundaireKnop, flex: 1, padding: '11px 12px', fontSize: 14 }}
        >
          {bezig ? 'Bezig…' : '📷 Foto maken'}
        </button>
        <button
          type="button"
          onClick={() => bibliotheekRef.current?.click()}
          disabled={bezig}
          style={{ ...secundaireKnop, padding: '11px 12px', fontSize: 14 }}
        >
          Kiezen
        </button>
      </div>

      {/* capture="environment" dwingt de achtercamera af; zónder de tweede input kun je dan
          geen bestaande foto meer kiezen. */}
      <input
        ref={cameraRef} type="file" accept="image/*" capture="environment" multiple
        style={{ display: 'none' }}
        onChange={e => { void verwerk(e.target.files); e.target.value = '' }}
      />
      <input
        ref={bibliotheekRef} type="file" accept="image/*" multiple
        style={{ display: 'none' }}
        onChange={e => { void verwerk(e.target.files); e.target.value = '' }}
      />

      {mist && (
        <p style={{ margin: '6px 0 0', fontSize: 12, color: ROOD, fontWeight: 600 }}>
          Een foto is verplicht bij deze afwijking.
        </p>
      )}
      {fout && <p style={{ margin: '6px 0 0', fontSize: 12, color: ROOD }}>{fout}</p>}
      {!mist && !fout && fotos.length === 0 && (
        <p style={{ margin: '6px 0 0', fontSize: 11, color: ZACHT }}>Optioneel</p>
      )}
      {fotos.length > 0 && (
        <p style={{ margin: '6px 0 0', fontSize: 11, color: GRIJS }}>
          {fotos.length} {fotos.length === 1 ? 'foto' : "foto's"}
        </p>
      )}
    </div>
  )
}
