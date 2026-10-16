'use client'

import React, { useState } from 'react'
import { useTranslations } from 'next-intl'
import { zoekOpNaam } from '@/lib/taken/toewijzing'
import type { MedewerkerKeuze } from '@/app/(platform)/taken/actions/sjablonen'

export type ToewijsOptie = { value: string; naam: string; label: string }

/**
 * Schermvullend zoekscherm voor "Toegewezen aan" bij Nieuwe actie in EVA Mobiel. Vervangt de
 * gewone keuzelijst, waarin je op de telefoon door alle medewerkers moest scrollen. Tik op een
 * naam = kiezen en terug naar het formulier.
 *
 * Staat binnen het formulier van `MobielNieuweActie`; daarom vangt het zoekveld Enter af, anders
 * zou de "Go"-toets van het toetsenbord de actie al aanmaken.
 */
export default function MobielMedewerkerZoeker({ opties, zonderAccount, gekozen, onKies, onSluit }: {
  opties: ToewijsOptie[]
  /** Kunnen geen actie krijgen; alleen bij zoeken getoond, zodat duidelijk is waarom ze ontbreken. */
  zonderAccount: MedewerkerKeuze[]
  gekozen: string
  onKies: (userId: string) => void
  onSluit: () => void
}) {
  const t = useTranslations('taken')
  const [zoekterm, setZoekterm] = useState('')
  const resultaten = zoekOpNaam(opties, zoekterm)
  const nietToewijsbaar = zoekterm.trim() ? zoekOpNaam(zonderAccount, zoekterm) : []

  function opToets(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    // Eén treffer: Enter kiest die. Meer treffers: niet raden, de gebruiker tikt zelf.
    if (resultaten.length === 1) onKies(resultaten[0].value)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 80, background: 'var(--bg)',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        flexShrink: 0, background: 'var(--bg-elev)', borderBottom: '1px solid var(--border)',
        padding: 'calc(8px + env(safe-area-inset-top, 0px)) 8px 12px 16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
          <div style={{ minWidth: 0, fontSize: 17, fontWeight: 800, color: 'var(--fg)' }}>
            {t('nieuw.kiesMedewerker')}
          </div>
          <button
            type="button"
            onClick={onSluit}
            style={{
              height: 36, padding: '0 14px', borderRadius: 18, flexShrink: 0,
              border: '1px solid var(--border)', background: 'transparent',
              fontSize: 14, fontWeight: 700, color: '#009439', cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent', fontFamily: 'inherit',
            }}
          >
            {t('nieuw.annuleren')}
          </button>
        </div>
        <div style={{ position: 'relative', marginRight: 8 }}>
          <svg
            width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#9aa4ab" strokeWidth={2} strokeLinecap="round"
            style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
          >
            <circle cx={11} cy={11} r={7} /><path d="m20 20-3.5-3.5" />
          </svg>
          {/* fontSize 16 voorkomt de auto-zoom van iOS Safari. */}
          <input
            autoFocus
            type="search"
            enterKeyHint="search"
            value={zoekterm}
            onChange={e => setZoekterm(e.target.value)}
            onKeyDown={opToets}
            placeholder={t('nieuw.zoekMedewerker')}
            style={{
              width: '100%', boxSizing: 'border-box',
              border: '1px solid var(--border)', borderRadius: 12,
              padding: '12px 14px 12px 42px', fontSize: 16, lineHeight: 1.4,
              color: 'var(--fg)', background: 'var(--bg)', fontFamily: 'inherit',
            }}
          />
        </div>
      </div>

      <div style={{
        flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', background: 'var(--bg-elev)',
        paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
      }}>
        {resultaten.length === 0 && nietToewijsbaar.length === 0 && (
          <div style={{ padding: '32px 16px', textAlign: 'center', fontSize: 14, color: '#9aa4ab' }}>
            {t('nieuw.geenMedewerkerGevonden', { zoekterm: zoekterm.trim() })}
          </div>
        )}
        {resultaten.map(o => {
          const actief = o.value === gekozen
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onKies(o.value)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
                padding: '14px 16px', border: 'none', borderBottom: '1px solid var(--border)',
                background: actief ? '#ecfaf0' : 'transparent', cursor: 'pointer',
                fontFamily: 'inherit', WebkitTapHighlightColor: 'transparent',
              }}
            >
              <span style={{
                flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600,
                color: actief ? '#0a5e28' : 'var(--fg)', overflowWrap: 'anywhere',
              }}>
                {o.label}
              </span>
              {actief && (
                <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#009439" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              )}
            </button>
          )
        })}
        {nietToewijsbaar.map(m => (
          <div
            key={m.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
              padding: '14px 16px', borderBottom: '1px solid var(--border)',
            }}
          >
            <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600, color: '#9aa4ab', overflowWrap: 'anywhere' }}>
              {m.naam}
            </span>
            <span style={{ fontSize: 12, color: '#9aa4ab' }}>{t('nieuw.geenAccount')}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
