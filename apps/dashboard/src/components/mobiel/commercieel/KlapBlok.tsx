'use client'

/**
 * Uitklapbaar blok met een kop, een aantal en maximaal een handvol rijen.
 *
 * Twee lagen begrenzing, allebei nodig op een telefoon. Blokken die niet over lopend geld
 * gaan (uitgevoerd werk, objecten, contactpersonen, notities) starten dicht, en een blok dat
 * open staat toont er vijf met "Toon alle N" eronder. De grootste klant heeft 114 dossiers;
 * zonder dit sta je te scrollen in plaats van te praten.
 *
 * Uitklappen doet geen netwerkverkeer: alle rijen zitten al in de payload van de pagina. Dat
 * is een bewuste afweging — 114 rijen is ongeveer 20 kB, en een tweede fetch op een
 * bouwverbinding kost meer dan hij bespaart.
 */

import React from 'react'
import { ChevronDown } from 'lucide-react'
import { GRIJS, OPPERVLAK, RAND, TEKST } from './stijl'

const STANDAARD_ZICHTBAAR = 5

export default function KlapBlok({
  titel, aantal, standaardOpen = false, id, leegTekst, children,
}: {
  titel: string
  aantal: number
  standaardOpen?: boolean
  /** Anker voor de signalenbalk, die hiernaartoe scrolt. */
  id?: string
  leegTekst?: string
  /** De rijen. Worden afgekapt op vijf tenzij "Toon alle" is aangetikt. */
  children: React.ReactNode
}) {
  const [open, setOpen] = React.useState(standaardOpen)
  const [alles, setAlles] = React.useState(false)

  const rijen = React.Children.toArray(children)
  const zichtbaar = alles ? rijen : rijen.slice(0, STANDAARD_ZICHTBAAR)
  const verborgen = rijen.length - zichtbaar.length

  return (
    <section id={id} style={{ marginBottom: 14, scrollMarginTop: 12 }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '11px 12px', borderRadius: 12,
          background: OPPERVLAK, border: `1px solid ${RAND}`,
          color: TEKST, fontSize: 14, fontWeight: 700, textAlign: 'left',
          cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
        }}
      >
        <ChevronDown
          size={17}
          style={{
            flexShrink: 0, color: GRIJS,
            transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
            transition: 'transform .15s ease',
          }}
          aria-hidden
        />
        <span style={{ flex: 1, minWidth: 0 }}>{titel}</span>
        <span style={{ flexShrink: 0, fontSize: 13, fontWeight: 700, color: GRIJS }}>{aantal}</span>
      </button>

      {open && (
        <div style={{ marginTop: 8 }}>
          {rijen.length === 0 ? (
            <div style={{ fontSize: 13.5, color: GRIJS, padding: '6px 2px 2px', lineHeight: 1.5 }}>
              {leegTekst ?? 'Niets te tonen.'}
            </div>
          ) : (
            <>
              {zichtbaar}
              {verborgen > 0 && (
                <button
                  type="button"
                  onClick={() => setAlles(true)}
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: 10,
                    background: 'transparent', border: `1px dashed ${RAND}`,
                    color: GRIJS, fontSize: 13, fontWeight: 600,
                    cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  Toon alle {rijen.length}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </section>
  )
}
