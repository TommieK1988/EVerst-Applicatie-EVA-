'use client'

import React from 'react'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { nl } from 'date-fns/locale'
import BottomSheet from '@/components/mobiel/BottomSheet'
import type { AgendaItem } from '@/lib/agenda/agenda-model'
import { tint } from './DagLijst'

const GROEN = '#009439'
const GRIJS = '#6b757c'

const dagLabel = (dag: string) => format(parseISO(dag), 'EEEE d MMMM', { locale: nl })

/** Eén regel die zowel een dagbereik als een tijdvak kan uitdrukken. */
function periode(item: AgendaItem): string {
  if (item.startDag !== item.eindDag) {
    return `${format(parseISO(item.startDag), 'd MMM', { locale: nl })} – ${format(parseISO(item.eindDag), 'd MMM', { locale: nl })}`
  }
  if (item.heleDag || !item.startTijd) return `${dagLabel(item.startDag)} · Hele dag`
  const tijd = item.eindTijd ? `${item.startTijd} – ${item.eindTijd}` : item.startTijd
  return `${dagLabel(item.startDag)} · ${tijd}`
}

export default function ItemSheet({ item, onSluit }: { item: AgendaItem; onSluit: () => void }) {
  return (
    <BottomSheet titel={item.titel} onSluit={onSluit} sluitLabel="Sluiten">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 4 }}>
        <div>
          <span style={{
            display: 'inline-block', padding: '3px 8px', borderRadius: 6,
            background: tint(item.kleur, 0.12), color: item.kleur,
            fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
            {item.typeLabel}
          </span>
        </div>

        <div style={{ fontSize: 14, color: 'var(--fg)', textTransform: 'capitalize' }}>
          {periode(item)}
        </div>

        {item.subtitel && (
          <div style={{ fontSize: 14, color: GRIJS }}>{item.subtitel}</div>
        )}

        {item.locatie && (
          <a
            href={`https://maps.google.com/?q=${encodeURIComponent(item.locatie)}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 14, color: GROEN, textDecoration: 'none' }}
          >
            📍 {item.locatie}
          </a>
        )}

        {item.detail && (
          <div style={{ fontSize: 13, color: GRIJS, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
            {item.detail}
          </div>
        )}

        {item.href && (
          <Link
            href={item.href}
            style={{
              marginTop: 2, padding: '13px 16px', borderRadius: 12,
              background: 'var(--bg)', border: '1px solid var(--border)',
              color: GRIJS, fontSize: 15, fontWeight: 600, textAlign: 'center',
              textDecoration: 'none',
            }}
          >
            {item.dossierId ? 'Naar dossier' : 'Naar mijn taken'}
          </Link>
        )}
      </div>
    </BottomSheet>
  )
}
