'use client'

import { useLayoutEffect, useState } from 'react'

/** Hoogte (px) waarmee een element precies tot de onderkant van zijn scrollvlak reikt.
 *
 *  Een scherm met `h-[calc(100dvh-56px)]` gaat ervan uit dat het direct onder de topbar
 *  begint. Staat het in een dossier-tab, dan staan dossierkop, tabbalk en terugknop
 *  erboven en valt de onderkant — bij de calculatie: de totalenbalk — onder de vouw.
 *  Deze hook meet hoeveel ruimte er onder het element werkelijk over is, zodat de
 *  onderste rand altijd in beeld blijft. `undefined` tot de eerste meting: laat de
 *  CSS-hoogte dan als terugval staan.
 *
 *  Geeft een callback-ref terug (geen useRef): het scherm rendert pas na het laden, en
 *  zo meet de hook opnieuw zodra het element er werkelijk is. */
export function usePasInScrollvlak(minHoogte = 420): [(el: HTMLElement | null) => void, number | undefined] {
  const [el, setEl] = useState<HTMLElement | null>(null)
  const [hoogte, setHoogte] = useState<number>()

  useLayoutEffect(() => {
    if (!el) return
    const scroller = zoekScrollvlak(el)

    const meet = () => {
      const vlak = scroller ? scroller.getBoundingClientRect() : { top: 0 }
      const zichtbaar = scroller ? scroller.clientHeight : window.innerHeight
      const scrollTop = scroller ? scroller.scrollTop : window.scrollY
      // Afstand vanaf de bovenkant van de scroll-inhoud, los van hoe ver er gescrold is.
      const boven = el.getBoundingClientRect().top - vlak.top + scrollTop
      setHoogte(Math.max(minHoogte, Math.floor(zichtbaar - boven)))
    }

    meet()
    window.addEventListener('resize', meet)
    // De kop erboven kan nog groeien (laden, meldingen); de eigen hoogte telt niet mee
    // in `boven`, dus dit observeren geeft geen lus.
    const ro = new ResizeObserver(meet)
    if (scroller) {
      ro.observe(scroller)
      if (scroller.firstElementChild) ro.observe(scroller.firstElementChild)
    }
    return () => { window.removeEventListener('resize', meet); ro.disconnect() }
  }, [el, minHoogte])

  return [setEl, hoogte]
}

function zoekScrollvlak(el: HTMLElement): HTMLElement | null {
  let p = el.parentElement
  while (p) {
    const { overflowY } = getComputedStyle(p)
    if (overflowY === 'auto' || overflowY === 'scroll') return p
    p = p.parentElement
  }
  return null
}
