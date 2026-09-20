'use client'

import React, { useId, useState } from 'react'
import type {
  Kanaal, KanaalRechten, ModuleRechten, RechtenModule, FunctieKey,
} from '@everts/database/platform-types'
import {
  RECHTEN_GROEPEN, modulesVoorKanaal, niveauHaalt, functiesVan,
} from '@everts/database/rechten'

/**
 * De rechtenmatrix van één kanaal: per onderdeel een niveau, en daaronder de
 * losse functies. De uitleg komt uit de catalogus — klap een onderdeel uit en je
 * leest wat lezen, schrijven en beheren daar precies betekenen.
 *
 * Twee standen:
 *  - afdelingsmatrix (`basis` niet meegegeven): Geen · Lezen · Schrijven · Beheren
 *  - persoonlijke afwijking (`basis` meegegeven): met een extra kolom Erven, en
 *    bij elk onderdeel wat de afdeling geeft. Zonder die kolom kun je het verschil
 *    tussen "erven" en "expliciet geen" niet meer uitdrukken, en dat verschil telt.
 */

type Niveau = ModuleRechten | null

const NIVEAUS: { value: Niveau; label: string; kleur: string }[] = [
  { value: null,        label: 'Geen',      kleur: 'var(--fg-muted)' },
  { value: 'lezen',     label: 'Lezen',     kleur: '#3b82f6' },
  { value: 'schrijven', label: 'Schrijven', kleur: '#f59e0b' },
  { value: 'beheren',   label: 'Beheren',   kleur: 'var(--accent)' },
]

const labelStijl: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: 'var(--fg-muted)',
  textTransform: 'uppercase', letterSpacing: '0.08em',
}

export type RechtenMatrixProps = {
  kanaal: Kanaal
  waarde: KanaalRechten
  /** De laag eronder. Meegeven = dit is een persoonlijke afwijking. */
  basis?: KanaalRechten
  onChange: (nieuw: KanaalRechten) => void
  /** Geef een reden terug om een onderdeel op slot te zetten (bv. jezelf). */
  vergrendeld?: (module: RechtenModule) => string | null
}

export default function RechtenMatrix({
  kanaal, waarde, basis, onChange, vergrendeld,
}: RechtenMatrixProps) {
  const [open, setOpen] = useState<Set<string>>(new Set())
  const isAfwijking = basis !== undefined
  const modules = modulesVoorKanaal(kanaal)

  // Radio's met dezelfde `name` vormen voor de browser één groep, ook als ze in
  // verschillende tabellen staan. Zonder dit voorvoegsel zetten vier afdelingen
  // onder elkaar elkaars keuzes uit en kan er in het hele scherm maar één knop
  // aan staan. Per matrix dus een eigen naamruimte.
  const naamruimte = useId()

  function zetNiveau(module: RechtenModule, niveau: Niveau | 'erven') {
    const modules = { ...waarde.modules }
    if (niveau === 'erven') delete modules[module]
    else modules[module] = niveau
    onChange({ ...waarde, modules })
  }

  function zetFunctie(functie: FunctieKey, stand: boolean | 'standaard') {
    const functies = { ...waarde.functies }
    if (stand === 'standaard') delete functies[functie]
    else functies[functie] = stand
    onChange({ ...waarde, functies })
  }

  const kolommen = isAfwijking ? NIVEAUS.length + 1 : NIVEAUS.length

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: isAfwijking ? 560 : 480 }}>
        <thead>
          <tr>
            <th style={{ ...labelStijl, textAlign: 'left', padding: '4px 8px 8px 0', width: '34%' }}>
              Onderdeel
            </th>
            {isAfwijking && (
              <th style={{ ...labelStijl, textAlign: 'center', padding: '4px 8px 8px' }}>Erven</th>
            )}
            {NIVEAUS.map(n => (
              <th key={n.label} style={{ ...labelStijl, textAlign: 'center', padding: '4px 8px 8px', color: n.kleur }}>
                {n.label}
              </th>
            ))}
          </tr>
        </thead>

        {RECHTEN_GROEPEN.map(groep => {
          const inGroep = modules.filter(m => m.groep === groep.key)
          if (inGroep.length === 0) return null

          return (
            <tbody key={groep.key}>
              <tr>
                <td colSpan={kolommen + 1} style={{ ...labelStijl, padding: '14px 0 4px', color: 'var(--fg-muted)' }}>
                  {groep.label}
                </td>
              </tr>

              {inGroep.map(m => {
                const eigen = waarde.modules[m.key]
                const geerfd = basis?.modules[m.key] ?? null
                const erft = isAfwijking && eigen === undefined
                const effectief: Niveau = erft ? geerfd : (eigen ?? null)
                const slot = vergrendeld?.(m.key) ?? null
                const uitgeklapt = open.has(m.key)
                const functies = functiesVan(m.key)

                return (
                  <React.Fragment key={m.key}>
                    <tr style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 8px 8px 0' }}>
                        <button
                          type="button"
                          onClick={() => setOpen(s => {
                            const n = new Set(s)
                            if (n.has(m.key)) n.delete(m.key); else n.add(m.key)
                            return n
                          })}
                          aria-expanded={uitgeklapt}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 6, padding: 0,
                            background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                            fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg)',
                          }}
                        >
                          <span style={{
                            display: 'inline-block', width: 8, color: 'var(--fg-muted)', fontSize: 9,
                            transform: uitgeklapt ? 'rotate(90deg)' : undefined, transition: 'transform .12s',
                          }}>▶</span>
                          {m.label}
                        </button>
                        {erft && (
                          <div style={{ fontSize: 10, color: 'var(--fg-muted)', marginLeft: 14, marginTop: 2 }}>
                            erft {geerfd ?? 'geen'} van de afdeling
                          </div>
                        )}
                        {slot && (
                          <div style={{ fontSize: 10, color: 'var(--fg-muted)', marginLeft: 14, marginTop: 2 }}>
                            {slot}
                          </div>
                        )}
                      </td>

                      {isAfwijking && (
                        <td style={{ textAlign: 'center', padding: 8 }}>
                          <input
                            type="radio" name={`${naamruimte}_${kanaal}_${m.key}`} disabled={!!slot}
                            checked={erft} onChange={() => zetNiveau(m.key, 'erven')}
                            style={{ width: 15, height: 15, cursor: slot ? 'not-allowed' : 'pointer' }}
                          />
                        </td>
                      )}

                      {NIVEAUS.map(n => (
                        <td key={n.label} style={{ textAlign: 'center', padding: 8 }}>
                          <input
                            type="radio" name={`${naamruimte}_${kanaal}_${m.key}`} disabled={!!slot}
                            checked={!erft && (eigen ?? null) === n.value}
                            onChange={() => zetNiveau(m.key, n.value)}
                            style={{
                              accentColor: n.kleur, width: 15, height: 15,
                              cursor: slot ? 'not-allowed' : 'pointer',
                            }}
                          />
                        </td>
                      ))}
                    </tr>

                    {uitgeklapt && (
                      <tr>
                        <td colSpan={kolommen + 1} style={{ padding: '2px 0 14px 14px' }}>
                          <div style={{
                            fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)',
                            lineHeight: 1.5, maxWidth: 780,
                          }}>
                            <p style={{ margin: '0 0 8px' }}>{m.omschrijving}</p>
                            {NIVEAUS.filter(n => n.value).map(n => (
                              <div key={n.label} style={{ display: 'flex', gap: 8, marginBottom: 3 }}>
                                <span style={{ color: n.kleur, fontWeight: 600, minWidth: 66 }}>{n.label}</span>
                                <span>{m.niveaus[n.value as ModuleRechten]}</span>
                              </div>
                            ))}

                            {functies.length > 0 && (
                              <div style={{ marginTop: 12 }}>
                                <div style={{ ...labelStijl, marginBottom: 6 }}>Functies</div>
                                {functies.map(f => (
                                  <FunctieRij
                                    key={f.key}
                                    label={f.label}
                                    uitleg={f.uitleg}
                                    inbegrepen={
                                      !!f.inbegrepenVanaf && niveauHaalt(effectief, f.inbegrepenVanaf)
                                    }
                                    eigen={waarde.functies[f.key]}
                                    geerfd={basis?.functies[f.key]}
                                    isAfwijking={isAfwijking}
                                    onZet={stand => zetFunctie(f.key, stand)}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          )
        })}
      </table>
    </div>
  )
}

function FunctieRij({
  label, uitleg, inbegrepen, eigen, geerfd, isAfwijking, onZet,
}: {
  label: string
  uitleg: string
  inbegrepen: boolean
  eigen: boolean | undefined
  geerfd: boolean | undefined
  isAfwijking: boolean
  onZet: (stand: boolean | 'standaard') => void
}) {
  const stand: 'standaard' | 'aan' | 'uit' =
    eigen === undefined ? 'standaard' : eigen ? 'aan' : 'uit'

  // Wat er gebeurt als je hem op "standaard" laat staan.
  const standaardUitleg = isAfwijking
    ? (geerfd === undefined
        ? (inbegrepen ? 'volgt de afdeling — nu aan via het niveau' : 'volgt de afdeling — nu uit')
        : `volgt de afdeling — nu ${geerfd ? 'aan' : 'uit'}`)
    : (inbegrepen ? 'inbegrepen bij dit niveau' : 'uit bij dit niveau')

  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', gap: 10, padding: '5px 0',
      borderTop: '1px solid var(--border)',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: 'var(--fg)', fontSize: 12 }}>{label}</div>
        <div style={{ fontSize: 11 }}>{uitleg}</div>
      </div>
      <div style={{ display: 'flex', gap: 10, whiteSpace: 'nowrap' }}>
        {([
          ['standaard', 'Standaard'],
          ['aan', 'Aan'],
          ['uit', 'Uit'],
        ] as const).map(([w, tekst]) => (
          <label key={w} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: 'pointer' }}>
            <input
              type="radio" checked={stand === w}
              onChange={() => onZet(w === 'standaard' ? 'standaard' : w === 'aan')}
              style={{ width: 13, height: 13, cursor: 'pointer' }}
            />
            {tekst}
          </label>
        ))}
      </div>
      <div style={{ fontSize: 10, width: 190, textAlign: 'right' }}>
        {stand === 'standaard' ? standaardUitleg : ''}
      </div>
    </div>
  )
}
