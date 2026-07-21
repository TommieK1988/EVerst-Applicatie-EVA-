import type { Metadata, Viewport } from 'next'
import { Montserrat, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import ServiceWorkerRegister from '@/components/eva/ServiceWorkerRegister'

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body className={`${montserrat.variable} ${jetbrainsMono.variable} font-sans`}>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  )
}
