'use client'
import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@everts/ui'
import { Card, CardHeader, CardBody } from './card'

/**
 * Een `Card` met een vaste hoogte die uitklapt zodra de inhoud niet past.
 *
 * Bestaansreden: op een scherm met acht blokken naast elkaar stretcht de CSS-grid elke
 * cel naar de hoogste kaart in de rij. Dezelfde informatie staat daardoor per dossier
 * op een andere plek en je bent telkens aan het zoeken. Met een vaste hoogte staat
 * alles altijd op dezelfde plaats; wat niet past zit achter één klik.
 *
 * Bewust een losse wrapper en géén prop op `Card` zelf: `Card` is een dunne
 * forwardRef-`div` die door de hele app wordt gebruikt, en die moet geen meet-effect
 * krijgen voor iets wat maar op een handvol plekken nodig is.
 */
export function InklapbareCard({
  titel,
  headerActies,
  hoogte = 320,
  altijdOpen = false,
  className,
  bodyClassName,
  children,
}: {
  titel: React.ReactNode
  /** Knoppen rechts in de header (de header is al `justify-between`). */
  headerActies?: React.ReactNode
  /** Ingeklapte hoogte in px, inclusief header en de uitklapknop. */
  hoogte?: number
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

  const kopRef    = React.useRef<HTMLDivElement>(null)
  const inhoudRef = React.useRef<HTMLDivElement>(null)
  const voetRef   = React.useRef<HTMLButtonElement>(null)

  // Meten met een ResizeObserver, niet met puur CSS. CSS kan wel een max-height
  // afdwingen maar niet weten óf er iets is afgekapt — dan zou de knop ook onder een
  // halflege kaart staan. Eén observer levert beide dingen tegelijk: de volle hoogte
  // (zodat `height` in twee richtingen echt animeert, wat met `auto` niet kan) en of
  // de inhoud overloopt.
  const meet = React.useCallback(() => {
    const inhoud = inhoudRef.current
    if (!inhoud) return
    const kop  = kopRef.current?.offsetHeight ?? 0
    const voet = voetRef.current?.offsetHeight ?? 0
    setVolleHoogte(kop + inhoud.offsetHeight + voet)
  }, [])

  React.useEffect(() => {
    const inhoud = inhoudRef.current
    if (!inhoud || typeof ResizeObserver === 'undefined') return
    meet()
    const obs = new ResizeObserver(meet)
    obs.observe(inhoud)
    if (kopRef.current) obs.observe(kopRef.current)
    return () => obs.disconnect()
  }, [children, meet])

  const overloopt = volleHoogte != null && volleHoogte > hoogte
  const toonKnop  = overloopt && !altijdOpen
  const uitgeklapt = altijdOpen || open

  // De knop bestaat pas nadat de eerste meting heeft uitgewezen dát er overloop is.
  // Die meting telde zijn hoogte dus nog niet mee, waardoor de uitgeklapte kaart precies
  // de knophoogte tekortkwam en de laatste regel alsnog wegviel. Meet opnieuw zodra hij
  // verschijnt of verdwijnt; de tweede meting levert dezelfde waarde en React stopt daar.
  React.useEffect(() => { meet() }, [toonKnop, meet])

  return (
    <Card
      data-inklapbaar
      className={cn('flex flex-col', className)}
      // Bij altijdOpen géén hoogte zetten: de kaart groeit dan vrij mee met het
      // formulier. Tijdens de eerste render is volleHoogte nog null; dan ook niets
      // zetten, zodat er geen sprong van 0 naar de gemeten hoogte ontstaat.
      style={
        altijdOpen || volleHoogte == null
          ? undefined
          : { height: uitgeklapt ? volleHoogte : hoogte, transition: 'height 180ms ease' }
      }
    >
      <div ref={kopRef} className="shrink-0">
        <CardHeader>
          <span>{titel}</span>
          {headerActies}
        </CardHeader>
      </div>

      <div
        className="relative min-h-0 flex-1 overflow-hidden"
        // Een browser scrollt een overflow:hidden-container zodra iets erin focus krijgt
        // via Tab. De inhoud schuift dan onzichtbaar weg terwijl de kaart even hoog blijft.
        // Klap in plaats daarvan uit — meteen ook de toetsenbordroute naar verborgen inhoud.
        onFocusCapture={() => { if (!uitgeklapt && overloopt) setOpen(true) }}
      >
        <div ref={inhoudRef}>
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
