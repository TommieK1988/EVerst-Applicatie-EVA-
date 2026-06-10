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
    template: '%s | HoutrotherstelApp',
    default: 'HoutrotherstelApp',
  },
  description:
    'Professionele applicatie voor het registreren van houtrotherstel tijdens onderhoudsprojecten',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="nl" suppressHydrationWarning>
      <body className={`${montserrat.variable} font-sans`}>
        {children}
        <ToastProvider />
      </body>
    </html>
  )
}
