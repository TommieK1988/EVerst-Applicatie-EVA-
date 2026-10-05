'use client'

import { useTranslations } from 'next-intl'
import VertaalbareTekst from '@/components/vertalen/VertaalbareTekst'
import type { IngeplandVerlof } from '@/lib/uren/afwezigheid-mobiel'

/**
 * Verlof dat in de planning staat zonder dat het via de app is aangevraagd — meestal door kantoor
 * of de medewerker zelf in Bouw7 gezet. Er valt niets meer te beoordelen of in te trekken, dus de
 * kaart toont alleen wanneer, wat voor afwezigheid, en de opmerking die erbij staat.
 */
export default function IngeplandVerlofKaart({ verlof, periode }: {
  verlof: IngeplandVerlof
  periode: string
}) {
  const t = useTranslations('verlof')
  const venster = verlof.startTijd && verlof.eindTijd ? ` · ${verlof.startTijd}-${verlof.eindTijd}` : ''
  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 12,
      background: 'var(--bg-elev)', padding: '12px 14px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--fg)' }}>
            {periode}{venster}
          </div>
          <div style={{ fontSize: 12, color: '#6b757c', marginTop: 2 }}>
            {t(`type.${verlof.type}`)}
          </div>
        </div>
        <span style={{
          padding: '4px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700,
          color: '#1f5f8b', background: '#e8f1f8', height: 'fit-content', maxWidth: '50%',
        }}>
          {t('ingepland')}
        </span>
      </div>
      {verlof.opmerking && (
        <div style={{ fontSize: 12, color: '#8a949a', marginTop: 6 }}>
          <VertaalbareTekst tekst={verlof.opmerking} label={false} />
        </div>
      )}
    </div>
  )
}
