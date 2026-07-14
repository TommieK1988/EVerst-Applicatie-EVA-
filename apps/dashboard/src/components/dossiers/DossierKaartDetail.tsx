'use client'
import React from 'react'
import type { DossierRij, DossierSectie } from './types'
import { IndicatorIcoon, TONE_KLEUREN, isVerlopen, type KaartIndicator } from './kaart-indicatoren'

/**
 * Het paneel dat onder de kanban-kaart uitschuift bij hoveren. Geeft de indicatoren van de
 * compacte kaart hun volledige uitleg, plus de datums en de klant-/prijsregels die van de
 * kaart zelf zijn gehaald om hem compact te houden.
 */

function formatBedrag(bedrag: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency', currency: 'EUR',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(bedrag)
}

function formatDatum(iso: string): string {
  return new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
}

function opslagKleur(pct: number): string {
  if (pct >= 25) return 'var(--success-600, #009439)'
  if (pct >= 15) return 'var(--warning-600, #d97706)'
  return 'var(--error-600, #d9534f)'
}

function DatumRegel({ label, iso, markeerVerlopen = false }: {
  label: string
  iso: string | null
  markeerVerlopen?: boolean
}) {
  if (!iso) return null
  const verlopen = markeerVerlopen && isVerlopen(iso)
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
      <span style={{ fontSize: 11, color: 'var(--neutral-500)' }}>{label}</span>
      <span style={{
        fontSize: 11, fontWeight: verlopen ? 700 : 500, whiteSpace: 'nowrap',
        color: verlopen ? 'var(--error-600, #d9534f)' : 'var(--neutral-700)',
      }}>
        {formatDatum(iso)}{verlopen ? ' · verlopen' : ''}
      </span>
    </div>
  )
}

export function DossierKaartDetail({ dossier, sectie, indicatoren }: {
  dossier: DossierRij
  sectie?: DossierSectie
  indicatoren: KaartIndicator[]
}) {
  const verkoopprijs = dossier.bedrag_excl_btw
  const kostprijs    = dossier.kostprijs_excl_btw
  const toonFinancieel = sectie === 'offerte'
    && kostprijs != null && kostprijs > 0
    && verkoopprijs != null && verkoopprijs > 0
  const opslagPct = toonFinancieel ? ((verkoopprijs! - kostprijs!) / kostprijs!) * 100 : 0

  const heeftDatums = !!(dossier.deadline || dossier.verwacht_startdatum
    || dossier.verwacht_einddatum || (sectie === 'offerte' && dossier.verzonden_op))

  return (
    <div style={{
      marginTop: 10, paddingTop: 10,
      borderTop: '1px dashed var(--border)',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      {/* Klant + (bij offertes) kostprijs en opslag — van de compacte kaart hierheen verhuisd */}
      {(dossier.klant_naam || toonFinancieel) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {dossier.klant_naam && (
            <div style={{ fontSize: 12, color: 'var(--neutral-700)', fontWeight: 500 }}>
              {dossier.klant_naam}
            </div>
          )}
          {toonFinancieel && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--neutral-500)' }}>
                Kostprijs {formatBedrag(kostprijs!)}
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, color: opslagKleur(opslagPct) }}>
                {opslagPct.toFixed(1)}% opslag
              </span>
            </div>
          )}
        </div>
      )}

      {/* Signalen: dezelfde indicatoren als de chips, nu met volledige uitleg */}
      {indicatoren.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {indicatoren.map(ind => {
            const kleur = TONE_KLEUREN[ind.tone]
            return (
              <div key={ind.soort} style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                <span style={{
                  display: 'inline-grid', placeItems: 'center',
                  width: 16, height: 16, borderRadius: 4, flexShrink: 0, marginTop: 0.5,
                  color: kleur.fg, background: kleur.bg, border: `1px solid ${kleur.border}`,
                }}>
                  <IndicatorIcoon soort={ind.soort} size={10} />
                </span>
                <span style={{ fontSize: 11.5, lineHeight: 1.4, color: 'var(--neutral-700)' }}>
                  {ind.uitleg}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Datums */}
      {heeftDatums && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {sectie === 'offerte' && <DatumRegel label="Verzonden"        iso={dossier.verzonden_op} />}
          <DatumRegel label="Gewenste deadline" iso={dossier.deadline}            markeerVerlopen />
          <DatumRegel label="Verwachte start"   iso={dossier.verwacht_startdatum} />
          <DatumRegel label="Verwacht einde"    iso={dossier.verwacht_einddatum}  markeerVerlopen />
        </div>
      )}
    </div>
  )
}
