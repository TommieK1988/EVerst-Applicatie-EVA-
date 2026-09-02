'use client'

import React from 'react'
import { format, isToday, isTomorrow, parseISO } from 'date-fns'
import { nl } from 'date-fns/locale'
import { CalendarDays } from 'lucide-react'
import type { AgendaItem } from '@/lib/agenda/agenda-model'

const GRIJS = '#6b757c'
const ZACHT = '#9aa4ab'

/** Hex → rgba, voor de flauwe tint achter een verlof- of ziektekaart. */
export function tint(hex: string, alpha: number): string {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex)
  if (!m) return 'transparent'
  const [r, g, b] = [m[1], m[2], m[3]].map(h => parseInt(h, 16))
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export default function DagLijst({ dag, items, onKies }: {
  dag: string
  items: AgendaItem[]
  onKies: (item: AgendaItem) => void
}) {
  const datum = parseISO(dag)
  const voorvoegsel = isToday(datum) ? 'Vandaag · ' : isTomorrow(datum) ? 'Morgen · ' : ''

  return (
    <div style={{ paddingBottom: 24 }}>
      <div style={{ padding: '14px 16px 8px', fontSize: 13, fontWeight: 700, color: GRIJS }}>
        {voorvoegsel}{format(datum, 'EEEE d MMMM', { locale: nl })}
      </div>

      {items.length === 0 ? (
        <div style={{
          padding: '32px 16px', display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: 10,
        }}>
          <CalendarDays size={28} color="#d7dde0" />
          <div style={{ fontSize: 13, color: ZACHT }}>Niets gepland op deze dag.</div>
        </div>
      ) : (
        <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map(item => (
            <Kaart key={item.id} item={item} onKies={onKies} />
          ))}
        </div>
      )}
    </div>
  )
}

function Kaart({ item, onKies }: { item: AgendaItem; onKies: (item: AgendaItem) => void }) {
  // Verlof en ziekte krijgen een gekleurd vlak: een niet-werkdag moet je in één
  // oogopslag herkennen, niet pas nadat je het label gelezen hebt.
  const gevuld = item.bron === 'afwezigheid'

  return (
    <button
      type="button"
      onClick={() => onKies(item)}
      style={{
        width: '100%', textAlign: 'left', padding: '12px 14px',
        background: gevuld ? tint(item.kleur, 0.07) : 'var(--bg-elev)',
        border: '1px solid var(--border)', borderLeft: `4px solid ${item.kleur}`,
        borderRadius: 12, cursor: 'pointer',
        WebkitTapHighlightColor: 'transparent', fontFamily: 'inherit',
        display: 'flex', gap: 10, alignItems: 'flex-start',
      }}
    >
      {item.heleDag ? (
        <span style={{
          flexShrink: 0, marginTop: 1, padding: '2px 7px', borderRadius: 6,
          background: tint(item.kleur, 0.12), color: item.kleur,
          fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em',
        }}>
          {item.typeLabel}
        </span>
      ) : (
        // Vaste breedte + flexShrink 0, anders drukt een lange titel de tijd weg.
        <span style={{ width: 44, flexShrink: 0 }}>
          <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: item.kleur }}>
            {item.startTijd}
          </span>
          {item.eindTijd && (
            <span style={{ display: 'block', fontSize: 11, color: ZACHT, marginTop: 1 }}>
              {item.eindTijd}
            </span>
          )}
        </span>
      )}

      {/* minWidth 0 maakt de ellipsis pas mogelijk binnen een flexregel. */}
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{
          display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--fg)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {item.titel}
        </span>
        {item.subtitel && (
          <span style={{
            display: 'block', fontSize: 12, color: GRIJS, marginTop: 2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {item.subtitel}
          </span>
        )}
        {item.locatie && (
          <span style={{
            display: 'block', fontSize: 12, color: ZACHT, marginTop: 2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            📍 {item.locatie}
          </span>
        )}
      </span>
    </button>
  )
}
