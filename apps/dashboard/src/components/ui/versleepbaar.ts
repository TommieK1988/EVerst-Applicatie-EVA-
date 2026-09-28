'use client'
import * as React from 'react'

/** Elementen waarop een klik gewoon een klik blijft, ook als ze in de greep staan. */
const INTERACTIEF = 'button, a, input, textarea, select, label, [role="combobox"], [role="button"], [contenteditable="true"]'

/** Zoveel van het venster blijft altijd in beeld, zodat je het terug kunt pakken. */
const MARGE = 96

/**
 * Maakt een venster versleepbaar aan zijn titelbalk. Pak het vast bij een element dat
 * `greep` matcht (standaard `[data-sleepgreep]`) en sleep het opzij om te zien wat erachter
 * staat. Knoppen en velden in de greep blijven gewoon klikbaar.
 *
 * Verschuift via de CSS-eigenschap `translate`, níet via `transform`: de open-animatie van de
 * dialogen zet zelf een `transform: scale(…)`, en die twee zouden elkaar overschrijven (zie de
 * centreer-valkuil in dialog.tsx). `translate` staat daar los van.
 *
 * De positie leeft in het venster zelf: sluiten en opnieuw openen begint weer in het midden.
 */
export function useVersleepbaar(greep = '[data-sleepgreep]') {
  const [offset, setOffset] = React.useState({ x: 0, y: 0 })
  const offsetRef = React.useRef(offset)
  offsetRef.current = offset

  const onPointerDown = React.useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return
    const doel = e.target as HTMLElement
    if (!doel.closest(greep) || doel.closest(INTERACTIEF)) return
    const venster = e.currentTarget
    if (!venster.contains(doel.closest(greep))) return

    e.preventDefault() // geen tekstselectie tijdens het slepen
    const start = { x: e.clientX, y: e.clientY }
    const begin = offsetRef.current
    const rect = venster.getBoundingClientRect()

    const beweeg = (ev: PointerEvent) => {
      let dx = ev.clientX - start.x
      let dy = ev.clientY - start.y
      // Houd de bovenrand (met de greep) binnen beeld, en minstens MARGE px van de breedte.
      dy = Math.min(Math.max(dy, -rect.top), window.innerHeight - MARGE / 2 - rect.top)
      dx = Math.min(Math.max(dx, MARGE - rect.right), window.innerWidth - MARGE - rect.left)
      setOffset({ x: begin.x + dx, y: begin.y + dy })
    }
    const stop = () => {
      window.removeEventListener('pointermove', beweeg)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
      document.body.style.removeProperty('user-select')
    }
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', beweeg)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
  }, [greep])

  const style: React.CSSProperties = offset.x || offset.y ? { translate: `${offset.x}px ${offset.y}px` } : {}
  return { onPointerDown, style }
}
