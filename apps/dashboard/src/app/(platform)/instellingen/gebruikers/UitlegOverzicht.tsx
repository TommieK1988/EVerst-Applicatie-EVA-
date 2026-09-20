import React from 'react'
import { RECHTEN_CATALOGUS, RECHTEN_GROEPEN } from '@everts/database/rechten'
import { Card } from '@/components/ui'

/**
 * De catalogus als naslag: wat betekent lezen, schrijven en beheren in dít
 * onderdeel, en welke losse functies zijn er. Alleen lezen — je komt hier om iets
 * op te zoeken zonder per ongeluk iets te veranderen.
 *
 * Server-component: er valt niets te klikken, dus er hoeft ook niets naar de
 * browser.
 */

const NIVEAUS = [
  { key: 'lezen' as const,     label: 'Lezen',     kleur: '#3b82f6' },
  { key: 'schrijven' as const, label: 'Schrijven', kleur: '#f59e0b' },
  { key: 'beheren' as const,   label: 'Beheren',   kleur: 'var(--accent)' },
]

const kopje: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: 'var(--fg-muted)',
  textTransform: 'uppercase', letterSpacing: '0.12em',
}

export default function UitlegOverzicht() {
  const zichtbaar = RECHTEN_CATALOGUS.filter(m => !('vervallen' in m && m.vervallen))

  return (
    <div>
      <p style={{
        fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--fg-muted)',
        lineHeight: 1.6, margin: '0 0 20px', maxWidth: 780,
      }}>
        De niveaus stapelen: wie mag schrijven, mag ook lezen. Wat elk niveau precies
        inhoudt verschilt per onderdeel — <em>beheren</em> op Wagenpark is iets heel
        anders dan <em>beheren</em> op Actielijsten. Functies staan los van de ladder
        en zijn bedoeld voor handelingen waar een niveau te grof voor is: bedragen
        zien, iets definitief verwijderen, accorderen.
      </p>

      {RECHTEN_GROEPEN.map(groep => {
        const inGroep = zichtbaar.filter(m => m.groep === groep.key)
        if (inGroep.length === 0) return null

        return (
          <section key={groep.key} style={{ marginBottom: 28 }}>
            <div style={{ ...kopje, marginBottom: 10 }}>{groep.label}</div>

            {inGroep.map(m => {
              const functies = 'functies' in m ? m.functies : []
              return (
                <Card key={m.key} style={{ padding: '14px 18px', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{
                      fontFamily: 'var(--font-display)', fontSize: 13.5, fontWeight: 600, color: 'var(--fg)',
                    }}>
                      {m.label}
                    </span>
                    <span style={{ fontSize: 10.5, color: 'var(--fg-muted)' }}>
                      {m.kanalen.join(' · ')}
                    </span>
                  </div>

                  <p style={{
                    fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)',
                    lineHeight: 1.5, margin: '6px 0 10px', maxWidth: 780,
                  }}>
                    {m.omschrijving}
                  </p>

                  {NIVEAUS.map(n => (
                    <div key={n.key} style={{
                      display: 'flex', gap: 10, fontFamily: 'var(--font-ui)', fontSize: 12,
                      color: 'var(--fg-muted)', lineHeight: 1.5, marginBottom: 3,
                    }}>
                      <span style={{ color: n.kleur, fontWeight: 600, minWidth: 68 }}>{n.label}</span>
                      <span>{m.niveaus[n.key]}</span>
                    </div>
                  ))}

                  {functies.length > 0 && (
                    <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                      <div style={{ ...kopje, marginBottom: 6 }}>Functies</div>
                      {functies.map(f => (
                        <div key={f.key} style={{
                          fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)',
                          lineHeight: 1.5, marginBottom: 4,
                        }}>
                          <span style={{ color: 'var(--fg)' }}>{f.label}</span>
                          {' — '}{f.uitleg}
                          {'inbegrepenVanaf' in f && f.inbegrepenVanaf && (
                            <span style={{ fontSize: 10.5 }}> (standaard aan vanaf {f.inbegrepenVanaf})</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              )
            })}
          </section>
        )
      })}
    </div>
  )
}
