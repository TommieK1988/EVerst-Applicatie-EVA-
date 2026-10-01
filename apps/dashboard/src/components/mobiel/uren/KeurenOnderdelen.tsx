'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { format, parseISO } from 'date-fns'
import { AlertTriangle, Check } from 'lucide-react'
import { useDatumLocale } from '@/i18n/client'
import type { KeurOnkosten } from '@/lib/mobiel/keuren'
import { useDateFnsLocale } from './datumOpmaak'

/**
 * Losse onderdelen van het fiatteerscherm (`KeurenClient`): de kostenlijst, de lege/fout-
 * melding en de vinkjes. Apart gezet zodat `KeurenClient` onder de 800 regels blijft.
 */

export const GROEN = '#009439'
export const GRIJS = '#6b757c'
export const ZACHT = '#9aa4ab'
export const ORANJE = '#b85a00'

/**
 * De kosten die je mensen deze periode indienden: parkeren, reiskosten, overig.
 *
 * Bewust alleen-lezen en zonder vinkjes. Een kostenpost hangt aan een weekstaat en niet aan
 * een Bouw7-urenregel, dus er is geen vlag om om te zetten -- het staat er zodat je bij het
 * fiatteren ziet wat er verder op die week geschreven is, met het bonnetje erbij.
 */
export function KostenBlok({ onkosten }: { onkosten: KeurOnkosten[] }) {
  const t = useTranslations('uren')
  const locale = useDatumLocale()
  const dfLocale = useDateFnsLocale()
  const euro = (n: number) => `€ ${n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const datumKort = (iso: string) => {
    try { return format(parseISO(iso), 'EEE d MMM', { locale: dfLocale }) } catch { return iso }
  }
  if (onkosten.length === 0) return null
  const totaal = onkosten.reduce((s, k) => s + k.bedrag, 0)

  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 12,
      background: 'var(--bg-elev)', overflow: 'hidden',
    }}>
      <div style={{
        padding: '11px 14px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'baseline', gap: 8,
      }}>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--fg)', flex: 1 }}>
          {t('keuren.ingediendeKosten')}
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: GRIJS, fontVariantNumeric: 'tabular-nums' }}>
          {euro(totaal)}
        </span>
      </div>

      {onkosten.map(k => (
        <div key={k.id} style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '9px 14px', borderTop: '1px solid var(--border)',
        }}>
          {k.bonUrl ? (
            <a href={k.bonUrl} target="_blank" rel="noreferrer" style={{ flexShrink: 0, lineHeight: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={k.bonUrl} alt={t('weekstaat.bonnetje')} style={{
                width: 34, height: 34, objectFit: 'cover',
                borderRadius: 7, border: '1px solid var(--border)',
              }} />
            </a>
          ) : (
            <span style={{ width: 34, flexShrink: 0 }} />
          )}

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, color: 'var(--fg)' }}>
              {t(`onkosten.label.${k.soort}`)}
              {k.vervoermiddel ? ` · ${t(`onkosten.vervoer.${k.vervoermiddel}`)}` : ''}
              {k.km ? ` · ${t('weekstaat.km', { km: k.km.toLocaleString(locale) })}` : ''}
            </div>
            <div style={{ fontSize: 11.5, color: ZACHT, marginTop: 1 }}>
              {datumKort(k.datum)} · {k.medewerkerNaam}
              {k.omschrijving ? ` · ${k.omschrijving}` : ''}
            </div>
          </div>

          <span style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {euro(k.bedrag)}
          </span>
        </div>
      ))}
    </div>
  )
}

export function Melding({ titel, tekst }: { titel: string; tekst: string }) {
  const t = useTranslations('uren')
  return (
    <div style={{ padding: '48px 24px', textAlign: 'center' }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--fg)', marginBottom: 6 }}>
        {titel}
      </div>
      <div style={{ fontSize: 13, color: GRIJS, lineHeight: 1.5 }}>{tekst}</div>
      <Link
        href="/m/uren"
        style={{
          display: 'inline-block', marginTop: 20, fontSize: 13,
          fontWeight: 600, color: GROEN, textDecoration: 'none',
        }}
      >
        {t('keuren.naarWeekstaat')}
      </Link>
    </div>
  )
}

export function Vinkje({ aan }: { aan: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        width: 22, height: 22, flexShrink: 0, borderRadius: 6,
        border: aan ? `2px solid ${GROEN}` : '2px solid var(--border)',
        background: aan ? GROEN : 'transparent',
        display: 'grid', placeItems: 'center', color: '#fff',
      }}
    >
      {aan && <Check size={14} strokeWidth={3} />}
    </span>
  )
}

/** Een regel die niet aan kán: er ontbreekt een bewakingscode. */
export function Waarschuwing() {
  return (
    <span
      aria-hidden
      style={{
        width: 22, height: 22, flexShrink: 0, borderRadius: 6,
        border: `2px solid ${ORANJE}`, color: ORANJE,
        display: 'grid', placeItems: 'center',
      }}
    >
      <AlertTriangle size={13} strokeWidth={2.6} />
    </span>
  )
}
