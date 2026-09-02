'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { addMonths, format, isSameMonth, isToday, subMonths } from 'date-fns'
import { nl } from 'date-fns/locale'
import {
  MAX_STIPPEN, dagSleutel, isFeestdag, maandGridDagen, stipKleuren,
  type AgendaItem,
} from '@/lib/agenda/agenda-model'

const GROEN = '#009439'
const RAND = '#e3e8ea'
const ZACHT = '#9aa4ab'
const BUITEN = '#c3cbd0'

const BALK_H = 48
const KOP_H = 22
const RIJ_H = 52
/** Zes vaste rijen: zie `maandGridDagen` — een wisselend aantal weken laat de pagina springen. */
export const GRID_H = BALK_H + KOP_H + RIJ_H * 6

const DAGNAMEN = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo']

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
  onWisselMaand: (delta: -1 | 1) => void
  onVandaag: () => void
}

export default function MaandGrid({
  peil, geselecteerd, perDag, bezig, onKiesDag, onWisselMaand, onVandaag,
}: Props) {
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

  const maandNaam = format(peil, 'LLLL yyyy', { locale: nl })
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
              Vandaag
            </button>
          )}
          <PijlKnop label="Vorige maand" teken="‹" onClick={() => onWisselMaand(-1)} />
          <PijlKnop label="Volgende maand" teken="›" onClick={() => onWisselMaand(1)} />
        </div>
        {/* Laadstreepje: houdt het grid staan terwijl een maand bijlaadt. */}
        <div style={{
          position: 'absolute', left: 0, bottom: 0, height: 2,
          width: bezig ? '100%' : 0, background: GROEN,
          transition: 'width .5s ease-out', opacity: bezig ? 1 : 0,
        }} />
      </div>

      {/* Weekdagkoppen */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', height: KOP_H }}>
        {DAGNAMEN.map(d => (
          <div key={d} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 700, color: ZACHT,
            textTransform: 'uppercase', letterSpacing: '0.08em',
          }}>{d}</div>
        ))}
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

function Rooster({ maand, geselecteerd, perDag, onKiesDag }: {
  maand: Date
  geselecteerd: string
  perDag: Map<string, AgendaItem[]>
  onKiesDag: (dag: string) => void
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gridTemplateRows: `repeat(6, ${RIJ_H}px)` }}>
      {maandGridDagen(maand).map(dag => {
        const sleutel = dagSleutel(dag)
        const items = perDag.get(sleutel) ?? []
        const inMaand = isSameMonth(dag, maand)
        const vandaag = isToday(dag)
        const gekozen = sleutel === geselecteerd
        const weekend = dag.getDay() === 0 || dag.getDay() === 6
        const feestdag = isFeestdag(items)
        const { kleuren, rest } = stipKleuren(items)

        const cirkelBg = gekozen ? (vandaag ? GROEN : '#161b20') : 'transparent'
        const cirkelKleur = gekozen ? '#fff'
          : vandaag ? GROEN
          : feestdag && inMaand ? '#dc2626'
          : inMaand ? 'var(--fg)' : BUITEN

        return (
          <button
            key={sleutel}
            type="button"
            onClick={() => onKiesDag(sleutel)}
            style={{
              border: 'none', padding: '4px 0 0', background: weekend ? 'rgba(0,0,0,0.02)' : 'transparent',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              cursor: 'pointer', WebkitTapHighlightColor: 'transparent', fontFamily: 'inherit',
            }}
          >
            <span style={{
              width: 28, height: 28, borderRadius: 999,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: cirkelBg, color: cirkelKleur,
              fontSize: 14, fontWeight: gekozen || vandaag || feestdag ? 800 : inMaand ? 600 : 500,
            }}>
              {format(dag, 'd')}
            </span>
            <span style={{ height: 6, display: 'flex', alignItems: 'center', gap: 3 }}>
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
      })}
    </div>
  )
}
