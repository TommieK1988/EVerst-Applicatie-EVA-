'use client'

import React, { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  beschikbareNavigatieApps, bewaarNavigatieApp, isAndroid, leesNavigatieApp, NAVIGATIE_APP_NAAM,
  STANDAARD_NAVIGATIE_APP, type NavigatieApp,
} from '@/lib/mobiel/navigatie'

/**
 * Keuze van de navigatie-app (Profiel → Instellingen). Per toestel opgeslagen; de
 * Navigeren-knoppen lezen hem via `NavigeerLink`. Zelfde opmaak als de taalkeuze.
 *
 * Op Android staan er twee extra keuzes: "Telefoon laat kiezen" (Android toont dan al je
 * navigatie-apps) en Flitsmeister. Op iOS werken die niet en laten we ze weg.
 */
export default function NavigatieAppKeuze() {
  const t = useTranslations('profiel.navigatieApp')
  // null tot localStorage gelezen is: voorkomt een hydration-mismatch en een flits van de verkeerde keuze.
  const [huidig, setHuidig] = useState<NavigatieApp | null>(null)
  // Tot het toestel bekend is de lijst die overal werkt; de Android-keuzes komen er daarna bij.
  const [apps, setApps] = useState<NavigatieApp[]>(() => beschikbareNavigatieApps(false))

  useEffect(() => {
    setApps(beschikbareNavigatieApps(isAndroid()))
    setHuidig(leesNavigatieApp())
  }, [])

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
        {apps.map((app) => {
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
              <span style={{ minWidth: 0, padding: '10px 0' }}>
                <span style={{ display: 'block' }}>
                  {app === 'telefoon' ? t('telefoon') : NAVIGATIE_APP_NAAM[app]}
                  {app === STANDAARD_NAVIGATIE_APP && <span style={{ fontWeight: 400, color: '#6b757c' }}> · {t('standaard')}</span>}
                </span>
                {app === 'telefoon' && (
                  <span style={{ display: 'block', fontSize: 12.5, fontWeight: 400, color: '#6b757c', marginTop: 2, lineHeight: 1.4 }}>
                    {t('telefoonUitleg')}
                  </span>
                )}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
