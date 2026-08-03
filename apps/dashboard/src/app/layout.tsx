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
  // Let op: het beeldmerk zelf is WIT (bedoeld voor een donkere ondergrond) en
  // valt daardoor weg als favicon/app-icoon op een licht startscherm. Gebruik
  // daarom de iconen mét groene achtergrond.
  icons: {
    icon: '/favicon-32.png',
    apple: '/apple-icon.png',
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
