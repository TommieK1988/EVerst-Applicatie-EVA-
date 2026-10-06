'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { addMonths, getISOWeek, isSameMonth, isToday, subMonths } from 'date-fns'
import { useTranslations } from 'next-intl'
import { useDatumLocale } from '@/i18n/client'
import {
  MAX_STIPPEN, dagSleutel, isFeestdag, maandGridDagen, stipKleuren,
  type AgendaItem,
} from '@/lib/agenda/agenda-model'

const GROEN = '#009439'
const RAND = '#e3e8ea'
const ZACHT = '#9aa4ab'
const BUITEN = '#c3cbd0'
const DONKER = '#161b20'
const ROOD = '#dc2626'
const TEKST = 'var(--fg)'
const GEEN = 'transparent'
const WIT = '#fff'

const BALK_H = 48
const KOP_H = 22
const RIJ_H = 52
/** Zes vaste rijen: zie `maandGridDagen` — een wisselend aantal weken laat de pagina springen. */
export const GRID_H = BALK_H + KOP_H + RIJ_H * 6

/**
 * Weeknummer, ma t/m vr, za, zo. Zaterdag en zondag zijn samen zo breed als één werkdag:
 * daar staat zelden iets, en zo krijgen de werkdagen de ruimte.
 */
const KOLOMMEN = '28px repeat(5, 1fr) 0.5fr 0.5fr'

/** Korte weekdagnamen in de taal van de app, maandag eerst (5 januari 2026 is een maandag). */
function dagnamen(locale: string): string[] {
  const opmaak = new Intl.DateTimeFormat(locale, { weekday: 'short' })
  return Array.from({ length: 7 }, (_, i) => opmaak.format(new Date(2026, 0, 5 + i, 12)))
}

/** Vanaf hier telt een beweging als richting; daaronder is het nog een tik. */
const RICHTING_DREMPEL = 8
/** Deel van de schermbreedte dat je moet slepen om van maand te wisselen. */
const COMMIT_DEEL = 0.28
/** Snelle flick: ook zonder de afstand te halen wissel je dan van maand. */
const FLICK_SNELHEID = 0.45
const ANIMATIE_MS = 220

type Props = {
  peil: Date
  geselecteerd: string
  perDag: Map<string, AgendaItem[]>
  bezig: boolean
  onKiesDag: (dag: string) => void
  /** Maandag (yyyy-MM-dd) van de week waarvan je het weeknummer aantikte. */
  onKiesWeek: (maandag: string) => void
  onWisselMaand: (delta: -1 | 1) => void
  onVandaag: () => void
}

export default function MaandGrid({
  peil, geselecteerd, perDag, bezig, onKiesDag, onKiesWeek, onWisselMaand, onVandaag,
}: Props) {
  const t = useTranslations('planning')
  const locale = useDatumLocale()
  const DAGNAMEN = useMemo(() => dagnamen(locale), [locale])
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [dx, setDx] = useState(0)
  const [animatie, setAnimatie] = useState(false)

  const startRef = useRef<{ x: number; y: number; t: number } | null>(null)
  const richtingRef = useRef<null | 'h' | 'v'>(null)
  /** Onderdrukt de klik die na een swipe op een dagcel zou landen. */
  const swipeRef = useRef(false)
  /** Blokkeert een tweede swipe zolang de vorige nog uitloopt. */
  const bezigRef = useRef(false)
  const wachtendRef = useRef<0 | -1 | 1>(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const afronden = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    const delta = wachtendRef.current
    wachtendRef.current = 0
    bezigRef.current = false
    setAnimatie(false)
    setDx(0)
    if (delta !== 0) onWisselMaand(delta)
  }, [onWisselMaand])

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  const onTouchStart = (e: React.TouchEvent) => {
    if (bezigRef.current) return
    const t = e.touches[0]
    startRef.current = { x: t.clientX, y: t.clientY, t: Date.now() }
    richtingRef.current = null
    swipeRef.current = false
    setAnimatie(false)
  }

  const onTouchMove = (e: React.TouchEvent) => {
    const start = startRef.current
    if (!start || bezigRef.current) return
    const t = e.touches[0]
    const dX = t.clientX - start.x
    const dY = t.clientY - start.y

    // Richting één keer vastleggen en daarna nooit meer omschakelen: anders gaat het
    // grid halverwege een verticale scroll alsnog zijwaarts schuiven.
    if (richtingRef.current === null) {
      if (Math.abs(dX) > RICHTING_DREMPEL && Math.abs(dX) > Math.abs(dY) * 1.4) {
        richtingRef.current = 'h'
        swipeRef.current = true
      } else if (Math.abs(dY) > RICHTING_DREMPEL) {
        richtingRef.current = 'v'
      }
    }
    if (richtingRef.current !== 'h') return

    // Geen preventDefault: `touchAction: 'pan-y'` op de wrapper laat de browser het
    // verticaal scrollen houden en geeft ons het horizontale deel. Daardoor is er ook
    // geen non-passieve listener nodig, wat met React-handlers niet betrouwbaar kan.
    const breedte = wrapperRef.current?.clientWidth ?? 1
    setDx(Math.max(-breedte, Math.min(breedte, dX)))
  }

  const onTouchEnd = () => {
    const start = startRef.current
    startRef.current = null
    if (!start || richtingRef.current !== 'h' || bezigRef.current) { setDx(0); return }

    const breedte = wrapperRef.current?.clientWidth ?? 1
    const duur = Math.max(1, Date.now() - start.t)
    const snelheid = Math.abs(dx) / duur
    const commit = Math.abs(dx) > breedte * COMMIT_DEEL || snelheid > FLICK_SNELHEID

    setAnimatie(true)
    if (commit && dx !== 0) {
      bezigRef.current = true
      wachtendRef.current = dx < 0 ? 1 : -1
      setDx(dx < 0 ? -breedte : breedte)
      // Vangnet: `transitionend` blijft weg als de transitie wordt onderbroken.
      timerRef.current = setTimeout(afronden, ANIMATIE_MS + 40)
    } else {
      setDx(0)
      timerRef.current = setTimeout(() => setAnimatie(false), ANIMATIE_MS + 40)
    }
  }

  const kiesDag = (dag: string) => {
    if (swipeRef.current) { swipeRef.current = false; return }
    onKiesDag(dag)
  }

  const kiesWeek = (maandag: string) => {
    if (swipeRef.current) { swipeRef.current = false; return }
    onKiesWeek(maandag)
  }

  const maandNaam = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(peil)
  const toonVandaag = !isSameMonth(peil, new Date()) || geselecteerd !== dagSleutel(new Date())

  return (
    <div style={{ background: 'var(--bg-elev)', borderBottom: `1px solid ${RAND}` }}>
      {/* Maandbalk */}
      <div style={{
        height: BALK_H, padding: '0 8px 0 16px', position: 'relative',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
      }}>
        <div style={{
          fontSize: 17, fontWeight: 800, letterSpacing: '-0.01em', color: 'var(--fg)',
          minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          textTransform: 'capitalize',
        }}>
          {maandNaam}
        </div>
        {/* flexShrink 0: zonder dit worden de knoppen platgedrukt zodra de maandnaam lang is. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
          {toonVandaag && (
            <button
              type="button"
              onClick={onVandaag}
              style={{
                height: 32, padding: '0 12px', marginRight: 4,
                borderRadius: 16, border: `1px solid ${RAND}`, background: 'transparent',
                fontSize: 12, fontWeight: 700, color: GROEN, cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent', fontFamily: 'inherit',
              }}
            >
              {t('vandaag')}
            </button>
          )}
          <PijlKnop label={t('vorigeMaand')} teken="‹" onClick={() => onWisselMaand(-1)} />
          <PijlKnop label={t('volgendeMaand')} teken="›" onClick={() => onWisselMaand(1)} />
        </div>
        {/* Laadstreepje: houdt het grid staan terwijl een maand bijlaadt. */}
        <div style={{
          position: 'absolute', left: 0, bottom: 0, height: 2,
          width: bezig ? '100%' : 0, background: GROEN,
          transition: 'width .5s ease-out', opacity: bezig ? 1 : 0,
        }} />
      </div>

      {/* Weekdagkoppen */}
      <div style={{ display: 'grid', gridTemplateColumns: KOLOMMEN, height: KOP_H }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 9, fontWeight: 700, color: BUITEN, textTransform: 'uppercase',
        }}>{t('weekKort')}</div>
        {DAGNAMEN.map((d, i) => {
          // Za/zo zijn half zo breed: in het Tamil ("ஞாயி.") liepen de koppen in elkaar.
          const smal = i >= 5
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: smal ? 9 : 10, fontWeight: 700, color: ZACHT,
              textTransform: 'uppercase', letterSpacing: smal ? 0 : '0.08em',
              minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap',
            }}>{smal ? d.replace(/\.$/, '') : d}</div>
          )
        })}
      </div>

      {/* Drie roosters naast elkaar; alleen het middelste is in beeld. */}
      <div
        ref={wrapperRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        style={{
          overflow: 'hidden',
          // Alleen hier, niet hoger in de boom: dit is de enige strook die zijwaarts sleept.
          touchAction: 'pan-y',
          userSelect: 'none', WebkitTapHighlightColor: 'transparent',
        }}
      >
        <div
          onTransitionEnd={afronden}
          style={{
            display: 'flex', width: '300%',
            transform: `translateX(calc(-33.3333% + ${dx}px))`,
            transition: animatie ? `transform ${ANIMATIE_MS}ms cubic-bezier(.22,.61,.36,1)` : 'none',
          }}
        >
          {[subMonths(peil, 1), peil, addMonths(peil, 1)].map((maand, i) => (
            // flex 0 0 33.3333%, nooit flex:1 — anders krimpen de panes tot een derde.
            <div key={i} style={{ flex: '0 0 33.3333%', minWidth: 0 }}>
              <Rooster
                maand={maand}
                geselecteerd={geselecteerd}
                perDag={perDag}
                onKiesDag={kiesDag}
                onKiesWeek={kiesWeek}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function PijlKnop({ label, teken, onClick }: { label: string; teken: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      style={{
        width: 40, height: 40, borderRadius: 999, border: 'none', background: 'transparent',
        color: GROEN, fontSize: 22, lineHeight: 1, cursor: 'pointer',
        WebkitTapHighlightColor: 'transparent', fontFamily: 'inherit', flexShrink: 0,
      }}
    >
      {teken}
    </button>
  )
}

function Rooster({ maand, geselecteerd, perDag, onKiesDag, onKiesWeek }: {
  maand: Date
  geselecteerd: string
  perDag: Map<string, AgendaItem[]>
  onKiesDag: (dag: string) => void
  onKiesWeek: (maandag: string) => void
}) {
  const t = useTranslations('planning')
  const dagen = maandGridDagen(maand)
  const weken = Array.from({ length: 6 }, (_, w) => dagen.slice(w * 7, w * 7 + 7))

  return (
    <div style={{ display: 'grid', gridTemplateColumns: KOLOMMEN, gridTemplateRows: `repeat(6, ${RIJ_H}px)` }}>
      {weken.map(week => {
        const nummer = getISOWeek(week[0])
        const maandag = dagSleutel(week[0])
        return (
          <React.Fragment key={maandag}>
            <button
              type="button"
              onClick={() => onKiesWeek(maandag)}
              aria-label={t('toonWeek', { nummer })}
              style={{
                border: 'none', padding: '4px 0 0', background: 'transparent',
                display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
                cursor: 'pointer', WebkitTapHighlightColor: 'transparent', fontFamily: 'inherit',
              }}
            >
              <span style={{
                height: 28, minWidth: 22, padding: '0 4px', borderRadius: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700, color: ZACHT, background: 'rgba(0,0,0,0.04)',
              }}>
                {nummer}
              </span>
            </button>
            {week.map(dag => (
              <DagCel
                key={dagSleutel(dag)}
                dag={dag}
                maand={maand}
                geselecteerd={geselecteerd}
                items={perDag.get(dagSleutel(dag)) ?? []}
                onKiesDag={onKiesDag}
              />
            ))}
          </React.Fragment>
        )
      })}
    </div>
  )
}

function DagCel({ dag, maand, geselecteerd, items, onKiesDag }: {
  dag: Date
  maand: Date
  geselecteerd: string
  items: AgendaItem[]
  onKiesDag: (dag: string) => void
}) {
  const sleutel = dagSleutel(dag)
  const inMaand = isSameMonth(dag, maand)
  const vandaag = isToday(dag)
  const gekozen = sleutel === geselecteerd
  // Weekenddagen zijn half zo breed (zie KOLOMMEN): kleinere cirkel en cijfer.
  const weekend = dag.getDay() === 0 || dag.getDay() === 6
  const cirkel = weekend ? 24 : 28
  const feestdag = isFeestdag(items)
  const { kleuren, rest } = stipKleuren(items)

  const cirkelBg = gekozen ? (vandaag ? GROEN : DONKER) : GEEN
  const cirkelKleur = gekozen ? WIT
    : vandaag ? GROEN
    : feestdag && inMaand ? ROOD
    : inMaand ? TEKST : BUITEN

  return (
    <button
      type="button"
      onClick={() => onKiesDag(sleutel)}
      style={{
        border: 'none', padding: weekend ? '6px 0 0' : '4px 0 0', minWidth: 0,
        background: weekend ? 'rgba(0,0,0,0.02)' : 'transparent',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: weekend ? 6 : 4,
        cursor: 'pointer', WebkitTapHighlightColor: 'transparent', fontFamily: 'inherit',
      }}
    >
      <span style={{
        width: cirkel, height: cirkel, borderRadius: 999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: cirkelBg, color: cirkelKleur,
        fontSize: weekend ? 12 : 14, fontWeight: gekozen || vandaag || feestdag ? 800 : inMaand ? 600 : 500,
      }}>
        {dag.getDate()}
      </span>
      <span style={{ height: 6, display: 'flex', alignItems: 'center', gap: weekend ? 2 : 3 }}>
        {kleuren.map((kleur, i) => (
          <span key={i} style={{
            width: 5, height: 5, borderRadius: 999, background: kleur,
            opacity: inMaand ? 1 : 0.4,
          }} />
        ))}
        {rest > 0 && kleuren.length === MAX_STIPPEN && (
          <span style={{ width: 3, height: 3, borderRadius: 999, background: BUITEN }} />
        )}
      </span>
    </button>
  )
}
