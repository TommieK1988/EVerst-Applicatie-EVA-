import React from 'react'
import SessieVerloop from '@/components/eva/SessieVerloop'
import PushHersteller from '@/components/eva/PushHersteller'
import GeenMobieleToegang from '@/components/auth/GeenMobieleToegang'
import DesktopRedirect from '@/components/mobiel/DesktopRedirect'
import MobielToasts from '@/components/mobiel/MobielToasts'
import { getCurrentMedewerker } from '@/lib/auth/rechten'
import { Noto_Sans_Tamil } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getAppTaal } from '@/i18n/server'
import { laadBerichten } from '@/i18n/berichten'
import { TIJDZONE } from '@/i18n/talen'
import HtmlTaal from '@/i18n/HtmlTaal'

/**
 * Montserrat heeft geen Tamil-tekens. Dit lettertype vult alleen die aan: de browser
 * downloadt het pas als er werkelijk Tamil op het scherm staat (unicode-range), dus
 * Nederlandse en Poolse gebruikers merken er niets van.
 */
const notoTamil = Noto_Sans_Tamil({
  subsets: ['tamil'],
  variable: '--font-noto-tamil',
  display: 'swap',
  preload: false,
})

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

export default async function MobielLayout({ children }: { children: React.ReactNode }) {
  // Defense in depth naast de login-poorten: een sessie zónder geldig medewerker-
  // record (bijv. een wachtwoord-sessie die de poort omzeilde) mag /m niet zien.
  const medewerker = await getCurrentMedewerker()
  if (!medewerker || medewerker.gebruiker_type === 'geen') {
    return <GeenMobieleToegang />
  }

  // De taal van de medewerker bepaalt alle teksten in de app. Alle naamruimtes gaan mee:
  // de app is één geheel en navigeert client-side tussen schermen.
  const taal = await getAppTaal()
  const berichten = await laadBerichten(taal)

  return (
    <NextIntlClientProvider locale={taal} messages={berichten} timeZone={TIJDZONE}>
    <HtmlTaal />
    <div
      className={`eva ${notoTamil.variable}`}
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
        fontFamily: "'Montserrat', var(--font-noto-tamil), ui-sans-serif, system-ui, sans-serif",
        WebkitFontSmoothing: 'antialiased',
      }}
    >
      {/* Uitloggen aan het eind van de werkdag; op mobiel ontbrak deze timer,
          waardoor alleen de middleware-backstop de sessie beëindigde. */}
      <SessieVerloop />
      {/* Legt het apparaatsoort vast en stuurt een desktop die alleen door een
          smal venster hier belandde terug naar de platformweergave. */}
      <DesktopRedirect />
      {/* Pushabonnement stil herstellen als het buiten EVA om is weggevallen. */}
      <PushHersteller />
      {/* Toast-uitgang. Stond alleen in de platform-layout, waardoor elke
          `toast.*` onder /m stilletjes verdween — zie MobielToasts. */}
      <MobielToasts />
      <div data-m-scroll style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
    </div>
    </NextIntlClientProvider>
  )
}
