'use client'

import React from 'react'
import { isToday, isTomorrow, parseISO } from 'date-fns'
import { CalendarDays } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useDatumLocale } from '@/i18n/client'
import VertaalbareTekst from '@/components/vertalen/VertaalbareTekst'
import type { AgendaItem } from '@/lib/agenda/agenda-model'
import AgendaTypeLabel from './AgendaTypeLabel'

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
  const t = useTranslations('planning')
  const locale = useDatumLocale()
  const datum = parseISO(dag)
  const datumTekst = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(datum)
  const kop = isToday(datum) ? t('vandaagMetDatum', { datum: datumTekst })
    : isTomorrow(datum) ? t('morgenMetDatum', { datum: datumTekst })
    : datumTekst

  return (
    <div style={{ paddingBottom: 24 }}>
      <div style={{ padding: '14px 16px 8px', fontSize: 13, fontWeight: 700, color: GRIJS }}>
        {kop}
      </div>

      {items.length === 0 ? (
        <div style={{
          padding: '32px 16px', display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: 10,
        }}>
          <CalendarDays size={28} color="#d7dde0" />
          <div style={{ fontSize: 13, color: ZACHT }}>{t('nietsGepland')}</div>
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

/**
 * Eén agenda-item als kaart. `verlopen` (weekweergave) dimt de kaart en kleurt hem grijs,
 * zodat je in één oogopslag ziet wat al voorbij is.
 */
export function Kaart({ item, onKies, verlopen = false }: {
  item: AgendaItem
  onKies: (item: AgendaItem) => void
  verlopen?: boolean
}) {
  const kleur = verlopen ? ZACHT : item.kleur
  // Verlof en ziekte krijgen een gekleurd vlak: een niet-werkdag moet je in één
  // oogopslag herkennen, niet pas nadat je het label gelezen hebt.
  const gevuld = item.bron === 'afwezigheid'

  return (
    <button
      type="button"
      onClick={() => onKies(item)}
      style={{
        width: '100%', textAlign: 'left', padding: '12px 14px',
        background: gevuld ? tint(kleur, 0.07) : 'var(--bg-elev)',
        border: '1px solid var(--border)', borderLeft: `4px solid ${kleur}`,
        borderRadius: 12, cursor: 'pointer', opacity: verlopen ? 0.45 : 1,
        WebkitTapHighlightColor: 'transparent', fontFamily: 'inherit',
        display: 'flex', gap: 10, alignItems: 'flex-start',
      }}
    >
      {item.heleDag ? (
        <span style={{
          flexShrink: 0, marginTop: 1, padding: '2px 7px', borderRadius: 6,
          background: tint(kleur, 0.12), color: kleur,
          fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em',
        }}>
          <AgendaTypeLabel tekst={item.typeLabel} />
        </span>
      ) : (
        // Vaste breedte + flexShrink 0, anders drukt een lange titel de tijd weg.
        <span style={{ width: 44, flexShrink: 0 }}>
          <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: kleur }}>
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
        <ItemTitel item={item} style={{
          display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--fg)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }} />
        {item.subtitel && (
          <ItemSubtitel item={item} style={{
            display: 'block', fontSize: 12, color: GRIJS, marginTop: 2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }} />
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

/**
 * Titel van een item. Bij afwezigheid is dat het vaste typelabel; anders tekst van kantoor
 * (activiteit, agenda-item, taak, feestdag) die we automatisch vertalen.
 */
export function ItemTitel({ item, style }: { item: AgendaItem; style?: React.CSSProperties }) {
  if (item.bron === 'afwezigheid') return <AgendaTypeLabel tekst={item.titel} style={style} />
  return <VertaalbareTekst tekst={item.titel} label={false} style={style} />
}

/**
 * Subtitel: bij afwezigheid de opmerking van kantoor (vertalen), bij de andere bronnen een
 * klantnaam, dossiernummer of locatie (niet vertalen).
 */
export function ItemSubtitel({ item, style, label = false }: {
  item: AgendaItem
  style?: React.CSSProperties
  label?: boolean
}) {
  if (item.bron === 'afwezigheid') return <VertaalbareTekst tekst={item.subtitel} label={label} style={style} />
  return <span style={style}>{item.subtitel}</span>
}
