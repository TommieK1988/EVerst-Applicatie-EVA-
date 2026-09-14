'use client'

import { useEffect } from 'react'

/**
 * Springt naar het blok uit de hash (`#blok-<uuid>`) en licht het even op.
 *
 * Twee dingen die hier makkelijk misgaan, en allebei alleen op een echt
 * toestel zichtbaar:
 *
 *  1. De scroll-container is niet het venster maar het content-gebied van de
 *     mobiele shell (`[data-m-scroll]` in app/m/layout.tsx). `scrollIntoView`
 *     werkt wél, want dat loopt zijn ouders af; zelf rekenen met
 *     `window.scrollTo` doet niets.
 *  2. `block: 'start'` zet het blok onder de `AppHeader`, die bovenaan de
 *     kolom staat. Vandaar `center`.
 *
 * De browser doet zelf ook een poging op de hash, maar die komt te vroeg: bij
 * een server-gerenderde pagina staat het element er dan nog niet altijd.
 */
export default function BlokFocus() {
  useEffect(() => {
    const id = window.location.hash.slice(1)
    if (!id.startsWith('blok-')) return

    const element = document.getElementById(id)
    if (!element) return

    element.scrollIntoView({ block: 'center', behavior: 'smooth' })

    const vorige = element.style.boxShadow
    element.style.boxShadow = '0 0 0 3px rgba(0,148,57,.35)'
    element.style.borderRadius = '8px'
    element.style.transition = 'box-shadow .4s ease'
    const timer = window.setTimeout(() => {
      element.style.boxShadow = vorige
    }, 2200)

    return () => window.clearTimeout(timer)
  }, [])

  return null
}
