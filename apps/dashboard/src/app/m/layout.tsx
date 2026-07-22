import React from 'react'
import SessieVerloop from '@/components/eva/SessieVerloop'

/**
 * MobielShell — eigen mobiele omgeving (`/m`), los van de desktop-PlatformShell.
 * Volledig viewport: scherm-content scrollt over de volle hoogte. Navigatie loopt
 * via het grid-startscherm (`/m` → `MobielHome`); er is bewust GEEN onderbalk
 * (zes onderdelen passen niet netjes in een bottom-nav). Elk sub-scherm heeft een
 * terug-link naar `/m` via `AppHeader`. Auth wordt door de middleware afgedwongen.
 *
 * LET OP — onderbalken/knoppen onderaan een scherm:
 * Dit is een flex-kolom met een scrollend content-gebied. Gebruik voor een vaste
 * actiebalk onderaan ALTIJD `position: sticky; bottom: 0` BINNEN het content-gebied
 * (of de gedeelde `MobielStickyFooter`). NOOIT `position: fixed` — dat ontsnapt aan
 * deze kolom.
 */
export const metadata = { title: 'EVA Mobiel' }

export default function MobielLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="eva"
      // Mobiel doet bewust NIET mee met donkere modus. Zonder deze vergrendeling
      // zou /m meekleuren zodra op hetzelfde apparaat donkere modus aanstaat,
      // terwijl er op mobiel geen schakelaar is om terug te zetten.
      data-theme="light"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100dvh',
        overflow: 'hidden',
        background: 'var(--bg)',
        fontFamily: "'Montserrat', ui-sans-serif, system-ui, sans-serif",
        WebkitFontSmoothing: 'antialiased',
      }}
    >
      {/* Uitloggen aan het eind van de werkdag; op mobiel ontbrak deze timer,
          waardoor alleen de middleware-backstop de sessie beëindigde. */}
      <SessieVerloop />
      <div data-m-scroll style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
    </div>
  )
}
