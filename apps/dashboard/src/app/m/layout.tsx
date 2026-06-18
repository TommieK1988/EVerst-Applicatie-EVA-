import React from 'react'
import MobielBottomNav from '@/components/mobiel/MobielBottomNav'

/**
 * MobielShell — eigen mobiele omgeving (`/m`), los van de desktop-PlatformShell.
 * Volledig viewport: scherm-content scrollt, bottom-nav staat vast onderaan
 * (boven de iOS home-indicator). Auth wordt door de middleware afgedwongen.
 *
 * LET OP — onderbalken/knoppen onderaan een scherm:
 * Dit is een flex-kolom met een scrollend content-gebied bóven de
 * `MobielBottomNav`. Gebruik voor een vaste actiebalk onderaan ALTIJD
 * `position: sticky; bottom: 0` BINNEN het content-gebied (of de gedeelde
 * `MobielStickyFooter`). NOOIT `position: fixed` — dat ontsnapt aan deze
 * kolom en valt achter de bottom-nav weg.
 */
export const metadata = { title: 'EVA Mobiel' }

export default function MobielLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="eva"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100dvh',
        overflow: 'hidden',
        background: 'var(--neutral-50, #f8fafa)',
        fontFamily: "'Montserrat', ui-sans-serif, system-ui, sans-serif",
        WebkitFontSmoothing: 'antialiased',
      }}
    >
      <div data-m-scroll style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
      <MobielBottomNav />
    </div>
  )
}
