import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Oplevering — Everts',
  robots: { index: false, follow: false },
}

/**
 * Publieke layout voor tokenlinks (/p/...). Bewust los van de ingelogde EVA-shell: geen sidebar,
 * geen navigatie — een schone, zelfstandige pagina voor onderaannemers, opdrachtgevers en bewoners.
 */
export default function PubliekLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100dvh', background: '#f4f6f5', color: '#1a1f24', fontFamily: 'var(--font-montserrat), system-ui, sans-serif' }}>
      <header style={{ background: '#fff', borderBottom: '1px solid #e4e8e7' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-beeldmerk.svg" alt="Everts" width={26} height={26} />
          <span style={{ fontWeight: 800, letterSpacing: '0.06em', fontSize: 15 }}>EVERTS.</span>
        </div>
      </header>
      <main style={{ maxWidth: 760, margin: '0 auto', padding: '24px 20px 64px' }}>{children}</main>
      <footer style={{ maxWidth: 760, margin: '0 auto', padding: '0 20px 32px', fontSize: 11.5, color: '#8a938f', textAlign: 'center' }}>
        Deze pagina is persoonlijk voor u aangemaakt. Deel de link niet met derden.
      </footer>
    </div>
  )
}
