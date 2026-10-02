'use client'

import React from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { ChevronRight } from 'lucide-react'
import { useDatumLocale } from '@/i18n/client'
import VertaalbareTekst from '@/components/vertalen/VertaalbareTekst'
import type { AgendaItem } from '@/lib/agenda/agenda-model'

const GRIJS = '#6b757c'
const ZACHT = '#9aa4ab'

/** Hoeveel items er op de startpagina passen voordat het een lijst wordt. */
const MAX_ITEMS = 3

/** Hex → rgba, voor het flauwe vlak achter een hele-dag-label. */
function tint(hex: string, alpha: number): string {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex)
  if (!m) return 'transparent'
  const [r, g, b] = [m[1], m[2], m[3]].map(h => parseInt(h, 16))
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/**
 * "Planning voor vandaag" op het mobiele startscherm: de eerste paar items van
 * vandaag, met een doorklik naar de volledige agenda.
 *
 * Bewust een korte lijst en geen dagoverzicht: dit is een launcher, niet de
 * agenda. Wie meer wil weten tikt door naar `/m/planning`, waar dezelfde items
 * staan (beide leunen op `haalAgendaVenster`).
 */
export default function VandaagWidget({ dag, items }: { dag: string; items: AgendaItem[] }) {
  const t = useTranslations('home.vandaag')
  const locale = useDatumLocale()
  // 'YYYY-MM-DD' als UTC-middernacht en zo ook opmaken: dan is het op server en telefoon
  // dezelfde dag, welke tijdzone het toestel ook heeft.
  const datumTekst = new Date(`${dag}T00:00:00Z`).toLocaleDateString(locale, {
    weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC',
  })
  const getoond = items.slice(0, MAX_ITEMS)
  const rest = items.length - getoond.length

  return (
    <section style={{ padding: '14px 16px 0' }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        gap: 8, marginBottom: 8,
      }}>
        <h2 style={{
          margin: 0, fontSize: 13, fontWeight: 700, color: GRIJS,
          letterSpacing: '-0.01em',
        }}>
          {t('titel')}
        </h2>
        <span style={{ fontSize: 12, color: ZACHT, flexShrink: 0 }}>
          {datumTekst}
        </span>
      </div>

      <div style={{
        background: 'var(--bg-elev, #fff)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        overflow: 'hidden',
      }}>
        {getoond.length === 0 ? (
          <div style={{ padding: '18px 14px', fontSize: 13, color: ZACHT }}>
            {t('nietsGepland')}
          </div>
        ) : (
          getoond.map((item, i) => (
            <Regel key={item.id} item={item} eerste={i === 0} />
          ))
        )}

        <Link
          href="/m/planning"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 8, padding: '11px 14px',
            borderTop: '1px solid var(--border)',
            color: '#009439', fontSize: 13, fontWeight: 600, textDecoration: 'none',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <span>{rest > 0 ? t('nogMeer', { aantal: rest }) : t('heleAgenda')}</span>
          <ChevronRight size={16} strokeWidth={2.4} />
        </Link>
      </div>
    </section>
  )
}

function Regel({ item, eerste }: { item: AgendaItem; eerste: boolean }) {
  const inhoud = (
    <>
      {/* Kleurstreep van de uursoort: dezelfde taal als de agenda zelf. */}
      <span
        aria-hidden
        style={{
          width: 3, alignSelf: 'stretch', borderRadius: 2,
          background: item.kleur, flexShrink: 0,
        }}
      />
      {item.heleDag ? (
        <span style={{
          flexShrink: 0, alignSelf: 'flex-start', marginTop: 1,
          padding: '2px 7px', borderRadius: 6,
          background: tint(item.kleur, 0.12), color: item.kleur,
          fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em',
        }}>
          <VertaalbareTekst tekst={item.typeLabel} label={false} />
        </span>
      ) : (
        // Vaste breedte + flexShrink 0, anders drukt een lange titel de tijd weg.
        <span style={{ width: 40, flexShrink: 0 }}>
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
          {/* Naam van het agenda-item komt van kantoor: in lijsten zonder label. */}
          <VertaalbareTekst tekst={item.titel} label={false} />
        </span>
        {(item.subtitel || item.locatie) && (
          <span style={{
            display: 'block', fontSize: 12, color: GRIJS, marginTop: 2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {item.subtitel ?? item.locatie}
          </span>
        )}
      </span>
    </>
  )

  const style: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '11px 14px',
    borderTop: eerste ? 'none' : '1px solid var(--border)',
    color: 'inherit', textDecoration: 'none',
    WebkitTapHighlightColor: 'transparent',
  }

  // Alleen items met een bestemming worden een link; verlof en feestdagen niet.
  return item.href
    ? <Link href={item.href} style={style}>{inhoud}</Link>
    : <div style={style}>{inhoud}</div>
}
