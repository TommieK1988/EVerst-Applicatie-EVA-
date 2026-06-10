import type { Metadata } from 'next'
import { Montserrat } from 'next/font/google'
import { Toaster } from 'react-hot-toast'
import { AppSidebar } from '@/components/shell/AppSidebar'
import { AppTopBar } from '@/components/shell/AppTopBar'
import './globals.css'

const montserrat = Montserrat({
  subsets: ['latin'],
  variable: '--font-montserrat',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    template: '%s | Geveltekening',
    default: 'Geveltekening — Everts',
  },
  description:
    'Genereer schaalnauwkeurige 2D geveltekeningen met annotaties voor houtrot, schilderwerk en gevelreparaties.',
  viewport: 'width=device-width, initial-scale=1',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="nl" suppressHydrationWarning>
      <body className={`${montserrat.variable} font-sans`}>
        <div className="flex h-screen bg-slate-50 overflow-hidden">
          <AppSidebar />
          <div className="flex-1 flex flex-col overflow-hidden">
            <AppTopBar title="Geveltekening" subtitle="Schaalnauwkeurige 2D gevels uit BAG-data" />
            <main className="flex-1 overflow-y-auto pb-16 lg:pb-0">{children}</main>
          </div>
        </div>
        <Toaster position="top-right" />
      </body>
    </html>
  )
}
