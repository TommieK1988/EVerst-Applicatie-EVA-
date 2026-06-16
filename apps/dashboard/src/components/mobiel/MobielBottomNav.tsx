'use client'
import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ListChecks, FolderOpen } from 'lucide-react'

/**
 * Mobiele bottom-nav (DS-spec): 2 tabs, 52px hoog, icoon 20px (stroke 2 actief /
 * 1.75 inactief), label 9px, dot 4px bij actief, actief #009439.
 */
const TABS = [
  { key: 'taken',    label: 'Taken',    href: '/m/taken',    Icon: ListChecks },
  { key: 'dossiers', label: 'Dossiers', href: '/m/dossiers', Icon: FolderOpen },
]

export default function MobielBottomNav() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Hoofdnavigatie"
      style={{
        flexShrink: 0,
        display: 'flex',
        background: 'var(--neutral-0, #fff)',
        borderTop: '1px solid var(--neutral-200, #e3e8ea)',
        zIndex: 40,
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {TABS.map(({ key, label, href, Icon }) => {
        const active = pathname === href || pathname.startsWith(href + '/')
        const color = active ? '#009439' : 'var(--neutral-400, #9aa4ab)'
        return (
          <Link
            key={key}
            href={href}
            style={{
              flex: 1, height: 52,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 3,
              textDecoration: 'none', color,
              transition: 'color 120ms',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <Icon size={20} strokeWidth={active ? 2 : 1.75} />
            <span style={{ fontSize: 9, fontWeight: active ? 700 : 500, lineHeight: 1 }}>{label}</span>
            {active && <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#009439', display: 'block' }} />}
          </Link>
        )
      })}
    </nav>
  )
}
