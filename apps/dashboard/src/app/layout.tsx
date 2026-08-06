import type { Metadata, Viewport } from 'next'
import { Montserrat, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import ServiceWorkerRegister from '@/components/eva/ServiceWorkerRegister'
import { DialoogProvider } from '@/components/ui/dialogen'

const montserrat = Montserrat({
  subsets: ['latin'],
  variable: '--font-montserrat',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    template: '%s | EVA',
    default: 'EVA — Everts Platform',
  },
  description: 'EVA — het centrale platform van Everts Groep',
  applicationName: 'EVA',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'EVA',
  },
  // Alle iconen zijn gerenderd uit /logo-beeldmerk.svg (het echte Everts-
  // beeldmerk: groene tegel met witte E en punt). Voor het tabblad en het
  // iOS-startscherm gebruiken we een doorlopende variant zónder afgeronde
  // hoeken: op 16-32px gaat de afronding verloren, en iOS rondt zelf al af —
  // dubbele afronding geeft anders een lelijke rand.
  //
  // De ?v= is een cache-buster: browsers bewaren favicons hardnekkig, dus zonder
  // die parameter blijven bestaande gebruikers het oude icoon zien. Ophogen
  // zodra de iconen opnieuw wijzigen.
  icons: {
    icon: [
      { url: '/favicon.ico?v=2', sizes: '16x16 32x32 48x48' },
      { url: '/favicon-16.png?v=2', type: 'image/png', sizes: '16x16' },
      { url: '/favicon-32.png?v=2', type: 'image/png', sizes: '32x32' },
      { url: '/icon-192.png?v=2', type: 'image/png', sizes: '192x192' },
    ],
    apple: [{ url: '/apple-icon.png?v=2', sizes: '180x180', type: 'image/png' }],
  },
}

export const viewport: Viewport = {
  themeColor: '#009439',
  width: 'device-width',
  initialScale: 1,
  // toestaan dat gebruikers inzoomen (toegankelijkheid); geen maximumScale-lock
  viewportFit: 'cover',
}

/**
 * Zet het thema op <html> vóór de eerste paint. Zonder dit rendert de pagina
 * eerst licht en klapt hij pas donker zodra React gehydrateerd is — een witte
 * flits bij elke navigatie. Leest dezelfde localStorage-sleutel als
 * PlatformShell; blijft bewust klein en zonder dependencies.
 */
const THEME_BOOTSTRAP = `(function(){try{
  var t=JSON.parse(localStorage.getItem('eva-tweaks')||'{}').theme;
  if(t&&t!=='light')document.documentElement.setAttribute('data-theme',t);
}catch(e){}})()`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className={`${montserrat.variable} ${jetbrainsMono.variable} font-sans`}>
        {/* EVA-eigen bevestig-/meld-/tekstdialogen i.p.v. de browser-popups
            (window.confirm/alert/prompt). Hier in de root zodat /(platform), /m
            en de publieke routes er alle drie bij kunnen. */}
        <DialoogProvider>{children}</DialoogProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  )
}
