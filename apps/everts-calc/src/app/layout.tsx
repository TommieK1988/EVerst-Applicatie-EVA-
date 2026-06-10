import type { Metadata } from 'next'
import { Montserrat } from 'next/font/google'
import './globals.css'
import ToastProvider from '@/components/shared/ToastProvider'

const montserrat = Montserrat({
  subsets: ['latin'],
  variable: '--font-montserrat',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    template: '%s | EvertsCalc',
    default: 'EvertsCalc — Calculatiesoftware',
  },
  description: 'Calculatiesoftware voor Everts Groep — schilderwerk, bouwkundig onderhoud en dakwerk',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body className={`${montserrat.variable} font-sans`}>
        {children}
        <ToastProvider />
      </body>
    </html>
  )
}
