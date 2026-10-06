'use client'

import React, { useEffect, useMemo } from 'react'
import { addDays, getISOWeek, isToday, isTomorrow, parseISO } from 'date-fns'
import { useTranslations } from 'next-intl'
import { useDatumLocale } from '@/i18n/client'
import { dagSleutel, sorteerDagItems, type AgendaItem } from '@/lib/agenda/agenda-model'
import { Kaart } from './DagLijst'

const GROEN = '#009439'
const GRIJS = '#6b757c'
const ZACHT = '#9aa4ab'
const RAND = '#e3e8ea'

/** Is het item al voorbij? Op vandaag telt de eindtijd; een hele-dag-item loopt tot middernacht. */
function isVerlopen(item: AgendaItem, vandaag: string, nu: string): boolean {
  if (item.eindDag < vandaag) return true
  if (item.eindDag > vandaag || item.heleDag) return false
  return item.eindTijd !== null && item.eindTijd <= nu
}

/**
 * Schermvullende weekweergave: alle items van één week onder elkaar, per dag gegroepeerd.
 * Wat al voorbij is wordt gedimd, zodat je meteen ziet wat er nog komt.
 *
 * Dezelfde overlay-aanpak als `BottomSheet`: `position: fixed` mag hier, en de shell
 * (`[data-m-scroll]`) moet apart vergrendeld worden, anders scrolt de agenda erachter mee.
 */
export default function WeekScherm({ maandag, perDag, onKies, onSluit }: {
  /** yyyy-MM-dd van de maandag. */
  maandag: string
  perDag: Map<string, AgendaItem[]>
  onKies: (item: AgendaItem) => void
  onSluit: () => void
}) {
  const t = useTranslations('planning')
  const locale = useDatumLocale()

  useEffect(() => {
    const scroller = document.querySelector('[data-m-scroll]') as HTMLElement | null
    const vorigeBody = document.body.style.overflow
    const vorigeScroller = scroller?.style.overflowY ?? ''
    document.body.style.overflow = 'hidden'
    if (scroller) scroller.style.overflowY = 'hidden'
    return () => {
      document.body.style.overflow = vorigeBody
      if (scroller) scroller.style.overflowY = vorigeScroller
    }
  }, [])

  const start = parseISO(maandag)
  const dagen = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(parseISO(maandag), i)),
    [maandag],
  )
  // Op de telefoon draait dit in NL-tijd; lokale klok is hier dus de juiste.
  const nuDatum = new Date()
  const vandaag = dagSleutel(nuDatum)
  const nu = `${String(nuDatum.getHours()).padStart(2, '0')}:${String(nuDatum.getMinutes()).padStart(2, '0')}`

  const kort = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' })
  const bereik = `${kort.format(start)} – ${kort.format(dagen[6])}`
  const dagOpmaak = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50, background: 'var(--bg)',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        flexShrink: 0, background: 'var(--bg-elev)', borderBottom: `1px solid ${RAND}`,
        padding: 'calc(8px + env(safe-area-inset-top, 0px)) 8px 8px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--fg)' }}>
            {t('weekKop', { nummer: getISOWeek(start) })}
          </div>
          <div style={{ fontSize: 12, color: GRIJS, marginTop: 2 }}>{bereik}</div>
        </div>
        <button
          type="button"
          onClick={onSluit}
          style={{
            height: 36, padding: '0 14px', borderRadius: 18, flexShrink: 0,
            border: `1px solid ${RAND}`, background: 'transparent',
            fontSize: 14, fontWeight: 700, color: GROEN, cursor: 'pointer',
            WebkitTapHighlightColor: 'transparent', fontFamily: 'inherit',
          }}
        >
          {t('sluiten')}
        </button>
      </div>

      <div style={{
        flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch',
        paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
      }}>
        {dagen.map(dag => {
          const sleutel = dagSleutel(dag)
          const items = sorteerDagItems(perDag.get(sleutel) ?? [])
          const voorbij = sleutel < vandaag
          const datumTekst = dagOpmaak.format(dag)
          const kop = isToday(dag) ? t('vandaagMetDatum', { datum: datumTekst })
            : isTomorrow(dag) ? t('morgenMetDatum', { datum: datumTekst })
            : datumTekst

          return (
            <section key={sleutel}>
              <div style={{
                padding: '16px 16px 8px', fontSize: 13, fontWeight: 700,
                color: isToday(dag) ? GROEN : GRIJS, opacity: voorbij ? 0.55 : 1,
              }}>
                {kop}
              </div>
              {items.length === 0 ? (
                <div style={{ padding: '0 16px', fontSize: 12, color: ZACHT, opacity: voorbij ? 0.55 : 1 }}>
                  {t('nietsGepland')}
                </div>
              ) : (
                <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {items.map(item => (
                    <Kaart
                      key={item.id}
                      item={item}
                      onKies={onKies}
                      verlopen={isVerlopen(item, vandaag, nu)}
                    />
                  ))}
                </div>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
