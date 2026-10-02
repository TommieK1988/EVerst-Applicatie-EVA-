'use client'

import React, { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { useTranslations } from 'next-intl'
import { useTaal } from '@/i18n/client'
import { TALEN, TAAL_NAAM, type Taal } from '@/i18n/talen'
import { zetMijnAppTaal } from '@/lib/taal/actions'

/**
 * Taalkeuze voor EVA Mobiel (Profiel → Instellingen). Elke taal staat in zijn eigen
 * schrift en naam, zodat iemand die geen Nederlands leest zijn taal toch terugvindt.
 */
export default function TaalKeuze() {
  const t = useTranslations('taal')
  const huidig = useTaal()
  const router = useRouter()
  const [bezig, start] = useTransition()

  const kies = (taal: Taal) => {
    if (taal === huidig || bezig) return
    start(async () => {
      const res = await zetMijnAppTaal(taal)
      if (!res.ok) { toast.error(t('mislukt')); return }
      router.refresh()
      toast.success(t('gewijzigd'))
    })
  }

  return (
    <div style={{
      padding: 16, background: 'var(--bg-elev)',
      border: '1px solid var(--border)', borderRadius: 14,
    }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--fg)' }}>{t('titel')}</div>
      <div style={{ fontSize: 12.5, color: '#6b757c', marginTop: 4, lineHeight: 1.4 }}>{t('uitleg')}</div>
      <div role="radiogroup" aria-label={t('titel')} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
        {TALEN.map((taal) => {
          const actief = taal === huidig
          return (
            <button
              key={taal}
              role="radio"
              aria-checked={actief}
              lang={taal}
              onClick={() => kies(taal)}
              disabled={bezig}
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
              {TAAL_NAAM[taal]}
            </button>
          )
        })}
      </div>
    </div>
  )
}
