'use client'

import React, { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  bewaarNavigatieApp, leesNavigatieApp, NAVIGATIE_APPS, NAVIGATIE_APP_NAAM, type NavigatieApp,
} from '@/lib/mobiel/navigatie'

/**
 * Keuze van de navigatie-app (Profiel → Instellingen). Per toestel opgeslagen; de
 * Navigeren-knoppen lezen hem via `NavigeerLink`. Zelfde opmaak als de taalkeuze.
 */
export default function NavigatieAppKeuze() {
  const t = useTranslations('profiel.navigatieApp')
  // null tot localStorage gelezen is: voorkomt een hydration-mismatch en een flits van de verkeerde keuze.
  const [huidig, setHuidig] = useState<NavigatieApp | null>(null)

  useEffect(() => { setHuidig(leesNavigatieApp()) }, [])

  const kies = (app: NavigatieApp) => {
    setHuidig(app)
    bewaarNavigatieApp(app)
  }

  return (
    <div style={{
      padding: 16, background: 'var(--bg-elev)',
      border: '1px solid var(--border)', borderRadius: 14,
    }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--fg)' }}>{t('titel')}</div>
      <div style={{ fontSize: 12.5, color: '#6b757c', marginTop: 4, lineHeight: 1.4 }}>{t('uitleg')}</div>
      <div role="radiogroup" aria-label={t('titel')} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
        {NAVIGATIE_APPS.map((app) => {
          const actief = app === huidig
          return (
            <button
              key={app}
              role="radio"
              aria-checked={actief}
              onClick={() => kies(app)}
              disabled={huidig === null}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                minHeight: 48, padding: '0 16px', borderRadius: 12, cursor: 'pointer',
                border: actief ? '2px solid #009439' : '1px solid var(--border)',
                background: actief ? 'rgba(0,148,57,0.06)' : 'var(--bg)',
                fontSize: 15, fontWeight: actief ? 700 : 500, color: 'var(--fg)',
                textAlign: 'left', WebkitTapHighlightColor: 'transparent',
              }}
            >
              <span aria-hidden style={{
                width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                border: actief ? '6px solid #009439' : '2px solid #c7ced2', background: '#fff',
              }} />
              {NAVIGATIE_APP_NAAM[app]}
            </button>
          )
        })}
      </div>
    </div>
  )
}
