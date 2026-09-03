'use client'
import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@everts/ui'
import { Card, CardHeader, CardBody } from './card'

/**
 * Een `Card` die precies zijn gridrij vult en uitklapt zodra de inhoud niet past.
 *
 * Bestaansreden: op een scherm met acht blokken naast elkaar stretcht de CSS-grid elke
 * cel naar de hoogste kaart in de rij. Dezelfde informatie staat daardoor per dossier
 * op een andere plek en je bent telkens aan het zoeken.
 *
 * De kaart zet géén eigen pixelhoogte: hij vult met `height: 100%` de rij die de grid
 * hem geeft (`auto-rows-[minmax(...)]`). Dat is het verschil met een vaste hoogte —
 * wordt een rij toch hoger, doordat de buurcel meer ruimte vraagt of doordat iemand
 * hem openklapt, dan groeit deze kaart mee in plaats van als korter blok bovenin die
 * rij te blijven hangen met een wit gat eronder. Onderranden lopen zo altijd gelijk.
 *
 * Uitklappen werkt via `min-height`: de rij is `minmax(hoogte, auto)`, dus een kaart
 * die meer vraagt dan het minimum trekt zijn eigen rij groter — en de buurkaart groeit
 * met dezelfde rij mee.
 */
export function InklapbareCard({
  titel,
  headerActies,
  altijdOpen = false,
  className,
  bodyClassName,
  children,
}: {
  titel: React.ReactNode
  /** Knoppen rechts in de header (de header is al `justify-between`). */
  headerActies?: React.ReactNode
  /**
   * Forceert de kaart open en verbergt de knop. Zet dit op de bewerkmodus: een
   * half afgekapt formulier is een val, geen ontwerp.
   */
  altijdOpen?: boolean
  className?: string
  bodyClassName?: string
  children: React.ReactNode
}) {
  const [open, setOpen] = React.useState(false)
  const [volleHoogte, setVolleHoogte] = React.useState<number | null>(null)
  const [overloopt, setOverloopt] = React.useState(false)

  const kopRef      = React.useRef<HTMLDivElement>(null)
  const kijkgatRef  = React.useRef<HTMLDivElement>(null)
  const inhoudRef   = React.useRef<HTMLDivElement>(null)
  const voetRef     = React.useRef<HTMLButtonElement>(null)

  // Meten met een ResizeObserver, niet met puur CSS. CSS kan wel clippen maar niet weten
  // óf er iets is afgekapt — dan zou de knop ook onder een halflege kaart staan.
  // We vergelijken de inhoud met het kijkgat zoals het nú op het scherm staat; dat werkt
  // ook als de rij een andere hoogte heeft gekregen dan het gridminimum.
  const meet = React.useCallback(() => {
    const inhoud = inhoudRef.current
    const kijkgat = kijkgatRef.current
    if (!inhoud || !kijkgat) return
    const kop  = kopRef.current?.offsetHeight ?? 0
    const voet = voetRef.current?.offsetHeight ?? 0
    setVolleHoogte(kop + inhoud.offsetHeight + voet)
    // 1px speling: subpixel-afronding maakte de knop anders zichtbaar bij inhoud die
    // exact past (kijkgat 261.6 vs inhoud 262).
    setOverloopt(inhoud.offsetHeight > kijkgat.clientHeight + 1)
  }, [])

  React.useEffect(() => {
    const inhoud = inhoudRef.current
    const kijkgat = kijkgatRef.current
    if (!inhoud || !kijkgat || typeof ResizeObserver === 'undefined') return
    meet()
    const obs = new ResizeObserver(meet)
    obs.observe(inhoud)
    obs.observe(kijkgat)          // rij wordt hoger/lager → opnieuw beoordelen
    if (kopRef.current) obs.observe(kopRef.current)
    return () => obs.disconnect()
  }, [children, meet])

  // `open` blijft meetellen: zodra de kaart openstaat past de inhoud per definitie,
  // dus zonder deze voorwaarde zou de knop verdwijnen en kon je niet meer inklappen.
  const toonKnop   = (overloopt || open) && !altijdOpen
  const uitgeklapt = altijdOpen || open

  return (
    <Card
      data-inklapbaar
      className={cn('flex h-full flex-col', className)}
      // min-height i.p.v. height: de kaart vult zijn rij, en trekt die alleen groter
      // wanneer hij openstaat. `height` zetten zou hem juist lostrekken van de rij.
      style={uitgeklapt && volleHoogte != null ? { minHeight: volleHoogte } : undefined}
    >
      <div ref={kopRef} className="shrink-0">
        <CardHeader>
          <span>{titel}</span>
          {headerActies}
        </CardHeader>
      </div>

      <div
        ref={kijkgatRef}
        className="relative min-h-0 flex-1 overflow-hidden"
        // Een browser scrollt een overflow:hidden-container zodra iets erin focus krijgt
        // via Tab. De inhoud schuift dan onzichtbaar weg terwijl de kaart even hoog blijft.
        // Klap in plaats daarvan uit — meteen ook de toetsenbordroute naar verborgen inhoud.
        onFocusCapture={() => { if (!uitgeklapt && overloopt) setOpen(true) }}
      >
        {/* Absoluut gepositioneerd, en dat is hier het hele mechanisme. `auto-rows` staat
            op minmax(hoogte, auto) en die `auto` rekent als max-content: gewone inhoud zou
            de rij dus alsnog groter maken en het clippen zinloos maken. Absolute inhoud
            telt niet mee voor de intrinsieke hoogte, dus de rij blijft op zijn minimum
            staan tot de kaart zelf om meer vraagt (min-height hierboven, bij uitklappen). */}
        <div ref={inhoudRef} className="absolute inset-x-0 top-0">
          <CardBody className={bodyClassName}>{children}</CardBody>
        </div>
        {!uitgeklapt && overloopt && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-white to-transparent"
          />
        )}
      </div>

      {toonKnop && (
        <button
          ref={voetRef}
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          className="flex shrink-0 items-center justify-center gap-1 border-t border-neutral-100 py-2 text-[11.5px] font-semibold text-[var(--brand-700)] transition-colors hover:bg-[var(--brand-50)]"
        >
          {open ? 'Minder tonen' : 'Meer tonen'}
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
        </button>
      )}
    </Card>
  )
}
