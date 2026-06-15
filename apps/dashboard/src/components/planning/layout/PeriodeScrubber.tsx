'use client'

import { addDays, addMonths, addWeeks, differenceInDays, format, startOfDay, startOfWeek } from 'date-fns'
import { nl } from 'date-fns/locale'
import { useEffect, useRef, useState } from 'react'
import { viewBereik, type View } from './usePlanningLayout'

export default function PeriodeScrubber({ view, peildatum, vs: vsOverride, onChange }: {
  view:      View
  peildatum: Date
  vs?:       Date          // werkelijke view-start; default = period-start van peildatum
  onChange:  (newVs: Date) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(800)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setW(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const today = startOfDay(new Date())
  const totalDays = 18 * 30
  const scrubStart = addMonths(today, -12)
  const ppd = w / totalDays

  // Venster-positie op basis van werkelijke vs (niet peildatum-snapshot)
  const { vs: snapVs, ve } = viewBereik(view, peildatum)
  const vs        = vsOverride ?? snapVs
  const winDays   = differenceInDays(startOfDay(ve), startOfDay(snapVs)) + 1
  const winStart  = differenceInDays(startOfDay(vs), scrubStart)
  const winLeft   = Math.max(0, winStart * ppd)
  const winWidth  = Math.max(2, winDays * ppd)

  const months: { left: number; label: string; isYearStart: boolean }[] = []
  for (let i = 0; i <= 18; i++) {
    const m = addMonths(scrubStart, i)
    months.push({
      left: differenceInDays(m, scrubStart) * ppd,
      label: format(m, 'MMM', { locale: nl }),
      isYearStart: m.getMonth() === 0,
    })
  }
  const todayLeft = differenceInDays(today, scrubStart) * ppd

  const weekLines: number[] = []
  let wk = startOfWeek(scrubStart, { weekStartsOn: 1 })
  const scrubEnd = addMonths(scrubStart, 18)
  while (wk < scrubEnd) {
    const left = differenceInDays(wk, scrubStart) * ppd
    if (left > 0) weekLines.push(left)
    wk = addWeeks(wk, 1)
  }

  const dragRef = useRef<{ startX: number; origVs: Date } | null>(null)

  // Klik op de tijdbalk → centreer het venster op de aangeklikte dag.
  function jumpToX(clientX: number) {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    const dag = Math.round((clientX - rect.left) / ppd)
    onChange(addDays(scrubStart, dag - Math.round(winDays / 2)))
  }

  function startDrag(ev: React.PointerEvent) {
    if (ev.button !== 0) return
    ev.preventDefault()
    // Sleep op de balk niet doorgeven aan de track-handler van de container — anders
    // wordt het oppakken óók als "spring naar cursor" gezien.
    ev.stopPropagation()
    ;(ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId)
    dragRef.current = { startX: ev.clientX, origVs: vs }
  }
  function onMove(ev: React.PointerEvent) {
    if (!dragRef.current) return
    const dxDays = Math.round((ev.clientX - dragRef.current.startX) / ppd)
    onChange(addDays(dragRef.current.origVs, dxDays))
  }
  function onUp() { dragRef.current = null }

  return (
    <div ref={ref} style={{
      position: 'relative', height: 38, background: 'var(--bg)',
      border: '1px solid var(--border)', borderRadius: 8,
      marginBottom: 10, cursor: 'pointer', userSelect: 'none', touchAction: 'none',
    }}
      onPointerDown={ev => { if (ev.button === 0) jumpToX(ev.clientX) }}>
      {weekLines.map((left, i) => (
        <div key={`w-${i}`} style={{
          position: 'absolute', top: '55%', bottom: 0,
          left, width: 1,
          background: 'var(--border)',
          opacity: 0.35,
          pointerEvents: 'none',
        }} />
      ))}
      {months.map((m, i) => (
        <div key={i} style={{
          position: 'absolute', top: 0, bottom: 0,
          left: m.left, width: 1,
          background: m.isYearStart ? 'var(--border)' : 'var(--border-soft)',
        }} />
      ))}
      {months.map((m, i) => (
        <span key={`l-${i}`} style={{
          position: 'absolute', top: 4, left: m.left + 3,
          fontSize: 9,
          color: 'var(--fg-muted)', pointerEvents: 'none',
          textTransform: 'uppercase', letterSpacing: '0.05em',
        }}>
          {m.label}
        </span>
      ))}
      <div style={{
        position: 'absolute', top: 0, bottom: 0,
        left: todayLeft, width: 2,
        background: 'var(--accent)', opacity: 0.6,
        pointerEvents: 'none',
      }} />
      <div data-bar="scrubber"
        onPointerDown={startDrag} onPointerMove={onMove} onPointerUp={onUp}
        style={{
          position: 'absolute', top: 18, bottom: 4,
          left: winLeft, width: winWidth,
          background: 'rgba(31,122,58,0.18)',
          border: '1.5px solid var(--accent)', borderRadius: 4,
          cursor: 'grab', touchAction: 'none', zIndex: 2,
        }} />
    </div>
  )
}
