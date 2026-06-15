'use client'

import React from 'react'
import {
  startOfMonth, endOfMonth, eachDayOfInterval,
  startOfWeek, isSameMonth, isToday,
  format,
} from 'date-fns'
import type { BedrijfsagendaRegel, BedrijfsagendaType } from '@everts/database/platform-types'
import { bedrijfsagendaTypeKleur } from '@everts/database/platform-types'

const DAGNAMES = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo']
const MAX_ZICHTBAAR = 3

function itemKleur(regel: BedrijfsagendaRegel): string {
  if (regel.bron === 'berekend') return regel.kleur
  return regel.kleur ?? bedrijfsagendaTypeKleur[regel.type as BedrijfsagendaType] ?? '#64748b'
}

function regelsOpDag(regels: BedrijfsagendaRegel[], dag: Date): BedrijfsagendaRegel[] {
  const dagStr = format(dag, 'yyyy-MM-dd')
  return regels.filter(r => r.start_datum <= dagStr && r.eind_datum >= dagStr)
}

type Props = {
  peildatum: Date
  regels: BedrijfsagendaRegel[]
  onItemClick: (item: BedrijfsagendaRegel) => void
  onDagClick?: (datum: string) => void
}

export default function MaandKalender({ peildatum, regels, onItemClick, onDagClick }: Props) {
  const maandStart = startOfMonth(peildatum)
  const maandEinde = endOfMonth(peildatum)
  const gridStart  = startOfWeek(maandStart, { weekStartsOn: 1 })
  const dagen      = eachDayOfInterval({ start: gridStart, end: maandEinde })

  // Vul aan tot volledig weken van 7 dagen
  const resterend = (7 - (dagen.length % 7)) % 7
  for (let i = 1; i <= resterend; i++) {
    const d = new Date(maandEinde)
    d.setDate(maandEinde.getDate() + i)
    dagen.push(d)
  }

  return (
    <div style={{ userSelect: 'none' }}>
      {/* Dag-headers */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
        borderBottom: '1px solid var(--border)',
      }}>
        {DAGNAMES.map(d => (
          <div key={d} style={{
            padding: '6px 0',
            textAlign: 'center',
            fontSize: 10, fontWeight: 700,
            color: 'var(--fg-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}>{d}</div>
        ))}
      </div>

      {/* Dag-grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
        border: '1px solid var(--border)',
        borderTop: 'none',
      }}>
        {dagen.map((dag, idx) => {
          const inMaand  = isSameMonth(dag, peildatum)
          const vandaag  = isToday(dag)
          const items    = regelsOpDag(regels, dag)
          const zichtbaar = items.slice(0, MAX_ZICHTBAAR)
          const rest      = items.length - MAX_ZICHTBAAR

          return (
            <div
              key={idx}
              onClick={() => onDagClick?.(format(dag, 'yyyy-MM-dd'))}
              style={{
                minHeight: 100,
                padding: '6px 6px 4px',
                borderRight: (idx + 1) % 7 === 0 ? 'none' : '1px solid var(--border)',
                borderBottom: idx >= dagen.length - 7 ? 'none' : '1px solid var(--border)',
                background: inMaand ? 'transparent' : 'var(--bg-muted, rgba(0,0,0,0.02))',
                position: 'relative',
                cursor: onDagClick ? 'pointer' : 'default',
              }}
            >
              {/* Dag-nummer */}
              <div style={{
                width: 24, height: 24,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: '50%',
                background: vandaag ? 'var(--accent)' : 'transparent',
                color: vandaag ? 'white' : inMaand ? 'var(--fg)' : 'var(--fg-muted)',
                fontSize: 12, fontWeight: vandaag ? 700 : 500,
                marginBottom: 4,
              }}>
                {format(dag, 'd')}
              </div>

              {/* Event-pills */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {zichtbaar.map((item) => (
                  <button
                    key={item.id}
                    onClick={(e) => { e.stopPropagation(); onItemClick(item) }}
                    title={item.titel}
                    style={{
                      display: 'block', width: '100%',
                      background: itemKleur(item),
                      color: 'white',
                      border: 'none', borderRadius: 3,
                      padding: '2px 5px',
                      fontSize: 10, fontWeight: 600,
                      textAlign: 'left',
                      cursor: 'pointer',
                      overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                      lineHeight: 1.4,
                    }}
                  >
                    {item.titel}
                  </button>
                ))}
                {rest > 0 && (
                  <div style={{
                    fontSize: 10, color: 'var(--fg-muted)',
                    fontWeight: 600, paddingLeft: 4,
                  }}>+{rest} meer</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
