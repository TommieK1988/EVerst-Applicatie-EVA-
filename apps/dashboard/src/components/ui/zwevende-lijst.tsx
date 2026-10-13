'use client'
import * as React from 'react'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { cn } from '@everts/ui'

/**
 * Keuzelijst onder een zoekveld, die nooit wordt afgeknipt.
 *
 * Een lijst met `absolute` binnen het veld hoort bij het vak eromheen. Staat dat vak in een
 * venster of in een scrollend rekenblad (`overflow: auto/hidden`), dan valt alles wat
 * eronder uitsteekt weg: de opties lopen "achter het venster langs". Deze lijst hangt via
 * een portal aan de pagina zelf, opent naar boven als er onder te weinig ruimte is, en
 * wordt nooit hoger dan de ruimte die er is.
 *
 * Gebouwd op de Radix-popover, en dat is bewust: binnen een Radix-venster (`Dialog`) gaan
 * kliks buiten het venster normaal verloren en sluiten ze het venster. Een popover is daar
 * een eigen laag boven, dus kiezen werkt en het venster blijft open.
 *
 * Het zoekveld blijft de baas: het bepaalt zelf `open` (bijv. bij typen) en sluit bij blur.
 * De lijst steelt de focus niet: een klik erin houdt de cursor in het zoekveld, zodat een
 * keuze met `onMouseDown` nog voor de blur binnenkomt, zoals de velden altijd al deden.
 */
export function ZwevendeLijst({
  open, onSluit, anker, children, breedte = 'anker', className,
}: {
  open: boolean
  /** Escape of een klik buiten veld en lijst. */
  onSluit: () => void
  /** Het element waaronder de lijst hangt (meestal het vak om het zoekveld). */
  anker: React.ReactElement
  children: React.ReactNode
  /** 'anker' = even breed als het anker; een getal = vaste breedte in px. */
  breedte?: 'anker' | number
  className?: string
}) {
  const ankerRef = React.useRef<HTMLDivElement>(null)
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={o => { if (!o) onSluit() }}>
      <PopoverPrimitive.Anchor asChild ref={ankerRef}>{anker}</PopoverPrimitive.Anchor>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          // Voor velden met eigen buiten-klik-logica: de lijst hangt buiten hun wrapper,
          // maar een klik erin is geen klik buiten. Zie isInZwevendeLijst.
          data-zwevende-lijst=""
          side="bottom"
          align="start"
          sideOffset={2}
          collisionPadding={8}
          onOpenAutoFocus={e => e.preventDefault()}
          onCloseAutoFocus={e => e.preventDefault()}
          // Een klik in het zoekveld zelf is geen klik "buiten".
          onInteractOutside={e => { if (ankerRef.current?.contains(e.target as Node)) e.preventDefault() }}
          // Focus blijft in het zoekveld; de keuze komt via onMouseDown van de optie.
          onMouseDown={e => e.preventDefault()}
          style={{
            width: breedte === 'anker' ? 'var(--radix-popover-trigger-width)' : breedte,
            maxWidth: 'calc(100vw - 16px)',
            maxHeight: 'min(16rem, var(--radix-popover-content-available-height))',
          }}
          // Boven elk venster, ook de zelfgebouwde met z-[1000].
          className={cn('z-[1100] overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg outline-none', className)}
        >
          {children}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}

/** Ligt dit element in een ZwevendeLijst? Voor eigen "klik buiten sluit"-logica. */
export function isInZwevendeLijst(el: EventTarget | null): boolean {
  return el instanceof Element && !!el.closest('[data-zwevende-lijst]')
}
