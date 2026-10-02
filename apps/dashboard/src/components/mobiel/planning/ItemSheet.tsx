'use client'

import React from 'react'
import Link from 'next/link'
import { parseISO } from 'date-fns'
import { useTranslations } from 'next-intl'
import BottomSheet from '@/components/mobiel/BottomSheet'
import { useDatumLocale } from '@/i18n/client'
import VertaalbareTekst from '@/components/vertalen/VertaalbareTekst'
import { useVertaling } from '@/components/vertalen/useVertaling'
import type { AgendaItem } from '@/lib/agenda/agenda-model'
import { ItemSubtitel, tint } from './DagLijst'
import AgendaTypeLabel, { useVastTypeLabel } from './AgendaTypeLabel'

const GROEN = '#009439'
const GRIJS = '#6b757c'

type Vertaler = ReturnType<typeof useTranslations<'planning'>>

/** Eén regel die zowel een dagbereik als een tijdvak kan uitdrukken. */
function periode(item: AgendaItem, locale: string, t: Vertaler): string {
  const dagLabel = (dag: string) =>
    new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(parseISO(dag))
  const kort = (dag: string) =>
    new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(parseISO(dag))
  if (item.startDag !== item.eindDag) {
    return `${kort(item.startDag)} – ${kort(item.eindDag)}`
  }
  if (item.heleDag || !item.startTijd) return t('dagHeleDag', { dag: dagLabel(item.startDag) })
  const tijd = item.eindTijd ? `${item.startTijd} – ${item.eindTijd}` : item.startTijd
  return `${dagLabel(item.startDag)} · ${tijd}`
}

export default function ItemSheet({ item, onSluit }: { item: AgendaItem; onSluit: () => void }) {
  const t = useTranslations('planning')
  const locale = useDatumLocale()
  const vastLabel = useVastTypeLabel()
  // De sheettitel is een attribuut, dus geen <VertaalbareTekst>. Bij afwezigheid is de titel
  // een vast label uit de taalbestanden; anders tekst van kantoor.
  const afwezig = item.bron === 'afwezigheid'
  const vertaald = useVertaling(afwezig ? null : item.titel)
  const titel = afwezig ? (vastLabel(item.titel) ?? item.titel) : vertaald.tekst
  return (
    <BottomSheet titel={titel} onSluit={onSluit} sluitLabel={t('sluiten')}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 4 }}>
        <div>
          <span style={{
            display: 'inline-block', padding: '3px 8px', borderRadius: 6,
            background: tint(item.kleur, 0.12), color: item.kleur,
            fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
            <AgendaTypeLabel tekst={item.typeLabel} />
          </span>
        </div>

        <div style={{ fontSize: 14, color: 'var(--fg)', textTransform: 'capitalize' }}>
          {periode(item, locale, t)}
        </div>

        {item.subtitel && (
          <ItemSubtitel item={item} label style={{ display: 'block', fontSize: 14, color: GRIJS }} />
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
          <VertaalbareTekst
            as="div"
            tekst={item.detail}
            style={{ fontSize: 13, color: GRIJS, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}
          />
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
            {item.dossierId ? t('naarDossier') : t('naarMijnTaken')}
          </Link>
        )}
      </div>
    </BottomSheet>
  )
}
