'use client'

import { useTranslations } from 'next-intl'
import { useDatumLocale } from '@/i18n/client'
import VertaalbareTekst from '@/components/vertalen/VertaalbareTekst'
import type { VerlofAanvraag } from '@/lib/uren/verlof'

type StatusSleutel = 'aangevraagd' | 'goedgekeurd' | 'afgewezen' | 'ingetrokken'

/** Kleuren per status; de tekst staat in `verlof.status.*`. */
const STATUS: Record<StatusSleutel, { kleur: string; achtergrond: string }> = {
  aangevraagd: { kleur: '#a15c00', achtergrond: '#fdf3e3' },
  goedgekeurd: { kleur: '#009439', achtergrond: '#e6f5ec' },
  afgewezen: { kleur: '#c0392b', achtergrond: '#fdecea' },
  ingetrokken: { kleur: '#8a8c86', achtergrond: '#f1f3f4' },
}

/** Onbekende status valt terug op "aangevraagd", zoals voorheen. */
function statusSleutel(status: string): StatusSleutel {
  return status in STATUS ? status as StatusSleutel : 'aangevraagd'
}

/**
 * Een verlofaanvraag die de medewerker zelf in de app deed: periode, soort, status, en wie hem
 * beoordeelde. Zolang hij nog open staat kan hij hier worden ingetrokken.
 */
export default function VerlofAanvraagKaart({ aanvraag: a, periode, onIntrekken }: {
  aanvraag: VerlofAanvraag
  periode: string
  onIntrekken: (a: VerlofAanvraag) => void
}) {
  const t = useTranslations('verlof')
  const locale = useDatumLocale()
  const sleutel = statusSleutel(a.status)
  const st = STATUS[sleutel]
  // "13:00-17:00" achter de periode, alleen bij een deel van een dag.
  const venster = a.startTijd && a.eindTijd ? ` · ${a.startTijd}-${a.eindTijd}` : ''
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
            <VertaalbareTekst tekst={a.uursoortNaam} label={false} />
            {' · '}{t('aantalUur', { uren: a.urenTotaal.toLocaleString(locale) })}
          </div>
        </div>
        <span style={{
          padding: '4px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700,
          color: st.kleur, background: st.achtergrond, height: 'fit-content', maxWidth: '50%',
        }}>
          {t(`status.${sleutel}`)}
        </span>
      </div>

      {a.toelichting && (
        <div style={{ fontSize: 12, color: '#8a949a', marginTop: 6 }}>{a.toelichting}</div>
      )}
      {a.status === 'afgewezen' && a.afwijzingReden && (
        <div style={{ fontSize: 12, color: '#c0392b', marginTop: 6 }}>
          <strong>{t('reden')}</strong>{' '}
          <VertaalbareTekst tekst={a.afwijzingReden} />
        </div>
      )}
      {/* Een hele afdeling kan beoordelen, dus de naam erbij: anders weet de aanvrager
          niet bij wie hij moet zijn als hij er iets over wil vragen. */}
      {a.beoordelaarNaam && (a.status === 'goedgekeurd' || a.status === 'afgewezen') && (
        <div style={{ fontSize: 11, color: '#8a949a', marginTop: 6 }}>
          {a.status === 'goedgekeurd'
            ? t('goedgekeurdDoor', { naam: a.beoordelaarNaam })
            : t('afgewezenDoor', { naam: a.beoordelaarNaam })}
        </div>
      )}
      {a.status === 'goedgekeurd' && a.bouw7Status === 'fout' && (
        <div style={{ fontSize: 11, color: '#a15c00', marginTop: 6 }}>
          {t('nietInBouw7')}
        </div>
      )}
      {a.status === 'aangevraagd' && (
        <button type="button" onClick={() => onIntrekken(a)}
          style={{
            marginTop: 8, border: 'none', background: 'transparent', padding: 0,
            fontFamily: 'inherit', fontSize: 12, fontWeight: 700, color: '#c0392b', cursor: 'pointer',
          }}>
          {t('intrekken')}
        </button>
      )}
    </div>
  )
}
