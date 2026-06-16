'use client'
import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { IconHome, IconSjablonen, IconFormulieren } from './Icons'

/**
 * Mobiele bottom-tab-bar. Alleen gerenderd onder de md-breakpoint (zie
 * PlatformShell + useIsMobile). De modules sluiten aan op de bestaande routes;
 * "Taken" verwijst naar /taken (in de desktop-sidebar "Actielijsten" genoemd).
 */
const TABS: { href: string; label: string; Icon: React.ComponentType<{ size?: number }> }[] = [
  { href: '/',            label: 'Overzicht',   Icon: IconHome },
  { href: '/taken',       label: 'Taken',       Icon: IconSjablonen },
  { href: '/formulieren', label: 'Formulieren', Icon: IconFormulieren },
]

export default function MobileBottomNav() {
  const pathname = usePathname()

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href)

  return (
    <nav
      aria-label="Hoofdnavigatie"
      style={{
        position: 'fixed', left: 0, right: 0, bottom: 0,
        height: 'var(--bottomnav-h)',
        background: 'var(--bg)',
        borderTop: '1px solid var(--border)',
        display: 'flex',
        zIndex: 40,
        // veilige zone voor iOS home-indicator
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {TABS.map(({ href, label, Icon }) => {
        const active = isActive(href)
        return (
          <Link
            key={href}
            href={href}
            style={{
              flex: 1,
              minHeight: 'var(--touch-target)',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 2,
              textDecoration: 'none',
              color: active ? 'var(--brand-700)' : 'var(--fg-muted)',
              fontSize: 10, fontWeight: active ? 700 : 500,
              letterSpacing: '0.02em',
            }}
          >
            <Icon size={22} />
            <span>{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
