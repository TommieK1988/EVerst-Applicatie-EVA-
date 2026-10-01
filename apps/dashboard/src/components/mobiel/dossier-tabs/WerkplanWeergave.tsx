'use client'

import { useTranslations } from 'next-intl'
import VertaalbareTekst from '@/components/vertalen/VertaalbareTekst'
import { isWerkomschrijvingKopje, werkafsprakenAlsZinnen, type Werkplan } from '@/lib/dossiers/werkplan-types'
import type { Betrokkene } from '@/lib/dossiers/betrokkenen-types'

const GRIJS = 'var(--fg-muted)'
const RAND = 'var(--border)'
const TEKST = 'var(--fg)'
const OPPERVLAK = 'var(--bg-elev)'

const kaart = { background: OPPERVLAK, border: `1px solid ${RAND}`, borderRadius: 14, padding: 14, marginBottom: 12 } as const
const kop = { margin: '0 0 10px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: GRIJS } as const

/** Vaste titels uit `werkafsprakenAlsZinnen` → sleutel in `dossiertabs.werkplan.afspraak`. */
const AFSPRAAK_SLEUTEL: Record<string, 'werktijden' | 'reisuren' | 'reiskosten' | 'parkeren'> = {
  'Afwijkende werktijden': 'werktijden',
  Reisuren: 'reisuren',
  Reiskosten: 'reiskosten',
  Parkeren: 'parkeren',
}

/**
 * Het werkplan op de telefoon: alleen-lezen. Per werkafspraak alleen de gekozen zin, met de
 * ingevulde waarde erin — de monteur hoeft niet te zien wat er níet geldt.
 */
export default function WerkplanWeergave({ werkplan, betrokkenen }: {
  werkplan: Werkplan | null
  betrokkenen: Betrokkene[]
}) {
  const t = useTranslations('dossiertabs.werkplan')
  if (!werkplan) {
    return (
      <div style={{ padding: '14px 16px 24px' }}>
        <p style={{ margin: 0, fontSize: 14, color: GRIJS }}>{t('geen')}</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '14px 16px 24px' }}>
      <section style={kaart}>
        <h2 style={kop}>{t('werkomschrijving')}</h2>
        {/* Werkomschrijving komt van kantoor: als geheel vertalen, daarna pas in regels knippen. */}
        <VertaalbareTekst tekst={werkplan.werkomschrijving} as="div" style={{ fontSize: 14, lineHeight: 1.5, color: TEKST }}>
          {(tekst) => tekst.split(/\r?\n/).map((r, i) =>
            isWerkomschrijvingKopje(r)
              ? <div key={i} style={{ fontWeight: 700, marginTop: i === 0 ? 0 : 8 }}>{r.trim()}</div>
              : <div key={i} style={{ whiteSpace: 'pre-wrap', minHeight: r.trim() ? undefined : 4 }}>{r}</div>,
          )}
        </VertaalbareTekst>
      </section>

      {betrokkenen.length > 0 && (
        <section style={kaart}>
          <h2 style={kop}>{t('overigeBetrokkenen')}</h2>
          {betrokkenen.map((b, i) => (
            <div key={b.sleutel} style={{ padding: '8px 0', borderTop: i === 0 ? 'none' : `1px solid ${RAND}` }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: TEKST }}>{b.naam}</div>
              {(b.rol || b.organisatie) && (
                <div style={{ fontSize: 12.5, color: GRIJS }}>
                  {[b.rol, b.organisatie?.naam !== b.naam ? b.organisatie?.naam : null].filter(Boolean).join(' · ')}
                </div>
              )}
              {b.telefoon && (
                <a href={`tel:${b.telefoon}`} style={{ display: 'inline-block', marginTop: 4, fontSize: 14, color: 'var(--brand-600, #007530)', minHeight: 24 }}>
                  {b.telefoon}
                </a>
              )}
            </div>
          ))}
        </section>
      )}

      <section style={kaart}>
        <h2 style={kop}>{t('werkafspraken')}</h2>
        {werkafsprakenAlsZinnen(werkplan).map((a, i) => (
          <div key={a.titel} style={{ padding: '8px 0', borderTop: i === 0 ? 'none' : `1px solid ${RAND}` }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: TEKST }}>
              {AFSPRAAK_SLEUTEL[a.titel] ? t(`afspraak.${AFSPRAAK_SLEUTEL[a.titel]}`) : a.titel}
            </div>
            <VertaalbareTekst tekst={a.zin} as="div" style={{ fontSize: 14, lineHeight: 1.45, color: TEKST, marginTop: 2 }} />
          </div>
        ))}
      </section>

      {werkplan.kleuren_materialen.length > 0 && (
        <section style={kaart}>
          <h2 style={kop}>{t('kleurenMaterialen')}</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, color: TEKST }}>
            <tbody>
              {werkplan.kleuren_materialen.map((r, i) => (
                <tr key={i} style={{ borderTop: i === 0 ? 'none' : `1px solid ${RAND}` }}>
                  <td style={{ padding: '6px 8px 6px 0', fontWeight: 600, verticalAlign: 'top', width: '45%' }}>{r.onderdeel ? <VertaalbareTekst tekst={r.onderdeel} label={false} /> : '—'}</td>
                  <td style={{ padding: '6px 0', verticalAlign: 'top' }}>{r.waarde || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}
