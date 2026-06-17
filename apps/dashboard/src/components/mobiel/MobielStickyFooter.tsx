import React from 'react'

/**
 * Vaste actie-/knoppenbalk onderaan een mobiel scherm (`/m`).
 *
 * Gebruik ALTIJD deze balk (of `position: sticky; bottom: 0` binnen het
 * scrollende content-gebied) voor knoppen onderaan een mobiel scherm —
 * NOOIT `position: fixed`.
 *
 * Waarom: de `/m`-shell (`app/m/layout.tsx`) is een flex-kolom met een
 * scrollend content-gebied bóven de vaste `MobielBottomNav`. Een
 * `position: fixed`-element ontsnapt aan die kolom en plakt tegen de
 * onderrand van het viewport — dus ACHTER de bottom-nav, waar het wegvalt.
 * Een `sticky`-element leeft binnen de scroll-container en stopt daardoor
 * automatisch nét boven de nav. Vandaar deze gedeelde, correcte primitive.
 *
 * Plaats deze als laatste kind binnen het scherm-content; geef het scherm
 * `minHeight: 100%` + `display: flex; flexDirection: column` mee zodat de
 * balk ook bij korte formulieren netjes onderaan blijft (zie `marginTop`).
 */
export default function MobielStickyFooter({
  children,
  style,
}: {
  children: React.ReactNode
  style?: React.CSSProperties
}) {
  return (
    <div
      style={{
        position: 'sticky',
        bottom: 0,
        marginTop: 'auto',
        display: 'flex',
        gap: 10,
        padding: '12px 14px calc(12px + env(safe-area-inset-bottom, 0px))',
        background: 'var(--neutral-0, #fff)',
        borderTop: '1px solid var(--neutral-200, #e3e8ea)',
        ...style,
      }}
    >
      {children}
    </div>
  )
}
