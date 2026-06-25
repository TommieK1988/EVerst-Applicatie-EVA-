'use client'

import { startOfDay } from 'date-fns'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { LABEL_W, VANDAAG_ANCHOR } from './constants'
import { usePlanningLayout, viewBereik, type PlanningLayout, type View } from './usePlanningLayout'

/**
 * Gedeelde state + gedrag voor de planning-tijdlijnen (Project + Medewerker), zodat
 * beide pagina's gegarandeerd identiek navigeren:
 *  - vaste dagbreedte + horizontale scroll (zie usePlanningLayout);
 *  - "Vandaag" (of de periodegrens) wordt op 1/6 van de breedte gezet bij openen,
 *    view-wissel, de Vandaag-knop en bij scrubben;
 *  - één set handlers voor PeriodeNav + PeriodeScrubber.
 */
export function usePlanningController(opts?: { defaultView?: View; labelW?: number; weekendFactor?: number }) {
  const labelW = opts?.labelW ?? LABEL_W
  const weekendFactor = opts?.weekendFactor
  const [view, setView]           = useState<View>(opts?.defaultView ?? 'maand')
  const [peildatum, setPeildatum] = useState<Date>(() => viewBereik(opts?.defaultView ?? 'maand', new Date()).vs)
  const [availableW, setAvailableW] = useState(800)

  const wrapRef   = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  // Bepaalt waarop de eerstvolgende layout-update de scroll ankert.
  const anchorRef = useRef<'today' | 'period' | 'scrub'>('today')
  // Exacte dag waarop bij scrubben wordt geankerd (per dag, los van de periodegrens).
  const anchorDateRef = useRef<Date | null>(null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      setAvailableW(Math.max(100, entry.contentRect.width - labelW))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [labelW])

  const layout = usePlanningLayout({ peildatum, view, availableW, weekendFactor })

  // Scroll zo dat het anker (Vandaag of periodegrens) op VANDAAG_ANCHOR landt.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const today    = startOfDay(new Date())
    const inWindow = today >= startOfDay(layout.vs) && today <= startOfDay(layout.ve)
    const target   = anchorRef.current === 'scrub' && anchorDateRef.current
      ? startOfDay(anchorDateRef.current)
      : anchorRef.current === 'today' && inWindow
        ? today
        : startOfDay(layout.periodeVs)
    el.scrollLeft  = Math.max(0, layout.xVoor(target.toISOString()) - availableW * VANDAAG_ANCHOR)
  }, [layout.vs, layout.periodeVs, layout.ppd, availableW, view, peildatum])

  // ‹ › — naar vorige/volgende periode; toon de nieuwe periodegrens op 1/6.
  const handlePeildatum = useCallback((d: Date) => {
    anchorRef.current = 'period'
    setPeildatum(viewBereik(view, d).vs)
  }, [view])

  // Zoom-wissel — spring terug naar nu, Vandaag op 1/6.
  const handleView = useCallback((v: View) => {
    anchorRef.current = 'today'
    setView(v)
    setPeildatum(viewBereik(v, new Date()).vs)
  }, [])

  const handleVandaag = useCallback(() => {
    anchorRef.current = 'today'
    setPeildatum(viewBereik(view, new Date()).vs)
  }, [view])

  // Scrubber — per dag scrubben: anker op de exacte aangewezen dag (op 1/6),
  // de gerenderde periode volgt die dag.
  const handleScrub = useCallback((newVs: Date) => {
    anchorRef.current = 'scrub'
    anchorDateRef.current = startOfDay(newVs)
    setPeildatum(startOfDay(newVs))
  }, [])

  return {
    view, peildatum, availableW, layout: layout as PlanningLayout,
    wrapRef, scrollRef,
    handlePeildatum, handleView, handleVandaag, handleScrub,
  }
}
