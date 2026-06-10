'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Calculator, BookOpen, BarChart3, Settings } from 'lucide-react'
import { cn, getInitials } from '@/lib/utils'

interface NavItem {
  href: string
  label: string
  icon: React.ElementType
  sublabel?: string
  subItems?: { href: string; label: string }[]
}

const navItems: NavItem[] = [
  {
    href: '/bibliotheek', label: 'Bibliotheek', icon: BookOpen, sublabel: 'Activiteiten & prijzen',
    subItems: [
      { href: '/bibliotheek/recepten', label: 'Recepten' },
      { href: '/bibliotheek/schilderwerk', label: 'Schilderwerk' },
      { href: '/bibliotheek/materialen', label: 'Materialen' },
    ],
  },
  { href: '/rapportages', label: 'Rapportages', icon: BarChart3, sublabel: 'Overzichten & export' },
  { href: '/instellingen', label: 'Instellingen', icon: Settings, sublabel: 'Tarieven & opslagen' },
]

const gebruiker = { naam: 'Kees Everts', rol: 'Calculator' }

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <>
      {/* Desktop sidebar — eva class zodat het thema overeenkomt met het dashboard */}
      <aside className="eva hidden lg:flex w-64 flex-col flex-shrink-0" style={{
        background: 'var(--bg-sidebar)',
        borderRight: '1px solid var(--border)',
      }}>
        {/* Logo */}
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <img src="/logo-beeldmerk.svg" alt="Everts" style={{ height: 36, width: 'auto', objectFit: 'contain', alignSelf: 'flex-start' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Calculator style={{ width: 13, height: 13, color: 'var(--fg-muted)' }} />
            <span style={{ fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 700, color: 'var(--fg-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Calculatiesoftware
            </span>
          </div>
        </div>

        {/* Navigatie */}
        <nav style={{ flex: 1, padding: '10px 10px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = pathname.startsWith(item.href)
            return (
              <div key={item.href}>
                <Link
                  href={item.href}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 13px', borderRadius: 7,
                    background: isActive ? 'var(--bg-active)' : 'transparent',
                    color: isActive ? 'var(--fg)' : 'var(--fg-muted)',
                    textDecoration: 'none',
                    fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: isActive ? 600 : 500,
                    transition: 'background 0.12s, color 0.12s',
                  }}
                  onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = 'var(--bg-active)'; e.currentTarget.style.color = 'var(--fg)' } }}
                  onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--fg-muted)' } }}
                >
                  <Icon style={{ width: 16, height: 16, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div>{item.label}</div>
                    {item.sublabel && (
                      <div style={{ fontSize: 11, marginTop: 1, color: 'var(--fg-muted)' }}>
                        {item.sublabel}
                      </div>
                    )}
                  </div>
                </Link>

                {isActive && item.subItems && (
                  <div style={{ marginLeft: 16, marginTop: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {item.subItems.map(sub => {
                      const subActive = pathname === sub.href
                      return (
                        <Link
                          key={sub.href}
                          href={sub.href}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '6px 13px', borderRadius: 6,
                            background: subActive ? 'var(--accent)' : 'transparent',
                            color: subActive ? 'white' : 'var(--fg-muted)',
                            textDecoration: 'none',
                            fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: subActive ? 600 : 500,
                          }}
                        >
                          <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'currentColor', opacity: 0.7, flexShrink: 0 }} />
                          {sub.label}
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        {/* Versie info */}
        <div style={{ padding: '6px 20px', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-muted)', textAlign: 'center', opacity: 0.6 }}>
            EvertsCalc v1.0
          </div>
        </div>

        {/* Gebruikersprofiel */}
        <div style={{ padding: '10px', borderTop: '1px solid var(--border)' }}>
          <Link
            href="/instellingen"
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 10px', borderRadius: 8,
              textDecoration: 'none',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-active)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <div style={{
              width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
              background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
              display: 'grid', placeItems: 'center',
              fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 700, color: 'white',
            }}>
              {getInitials(gebruiker.naam)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 600, color: 'var(--fg)', whiteSpace: 'nowrap' }}>
                {gebruiker.naam}
              </div>
              <div style={{ fontFamily: 'var(--font-ui)', fontSize: 10, color: 'var(--fg-muted)' }}>
                {gebruiker.rol}
              </div>
            </div>
          </Link>
        </div>
      </aside>

      {/* Mobiele bottom nav */}
      <nav className="eva lg:hidden fixed bottom-0 left-0 right-0 z-50 flex" style={{
        background: 'var(--bg-sidebar)',
        borderTop: '1px solid var(--border)',
      }}>
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                padding: '12px 4px',
                color: isActive ? 'var(--accent)' : 'var(--fg-muted)',
                textDecoration: 'none',
                fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: isActive ? 600 : 500,
              }}
            >
              <Icon style={{ width: 20, height: 20 }} />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}
