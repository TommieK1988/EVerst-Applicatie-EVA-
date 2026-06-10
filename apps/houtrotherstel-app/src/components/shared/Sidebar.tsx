'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  FolderOpen,
  Wrench,
  Users,
  BarChart3,
  Settings,
  ChevronRight,
} from 'lucide-react'
import { cn, getInitials, getRolLabel } from '@/lib/utils'
import type { Profile } from '@/lib/types'

interface SidebarProps {
  profile: Profile
}

interface NavItem {
  href: string
  label: string
  icon: React.ElementType
  roles?: string[]
  badge?: number
}

const navItems: NavItem[] = [
  {
    href: '/projecten',
    label: 'Projecten',
    icon: FolderOpen,
  },
  {
    href: '/standaard-reparaties',
    label: 'Bibliotheek',
    icon: Wrench,
    roles: ['admin', 'platform_gebruiker'],
  },
  {
    href: '/gebruikers',
    label: 'Gebruikers',
    icon: Users,
    roles: ['admin'],
  },
  {
    href: '/rapportages',
    label: 'Rapportages',
    icon: BarChart3,
    roles: ['admin', 'platform_gebruiker'],
  },
  {
    href: '/instellingen',
    label: 'Instellingen',
    icon: Settings,
  },
]

export default function Sidebar({ profile }: SidebarProps) {
  const pathname = usePathname()

  const visibleItems = navItems.filter(
    (item) => !item.roles || item.roles.includes(profile.role)
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 bg-everts-dark flex-col flex-shrink-0">
        {/* Logo */}
        <div className="p-5 border-b border-white/10">
          <img
            src="/logo-wit.svg"
            alt="Everts onderhoud & renovatie"
            className="h-9 w-auto"
          />
        </div>

        {/* Navigatie */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {visibleItems.map((item) => {
            const Icon = item.icon
            const isActive =
              pathname.startsWith(item.href)

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
                  isActive
                    ? 'bg-everts text-white shadow-sm'
                    : 'text-white/60 hover:bg-white/10 hover:text-white'
                )}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className="flex-1">{item.label}</span>
                {item.badge && (
                  <span className="bg-everts-light text-white text-xs px-1.5 py-0.5 rounded-full">
                    {item.badge}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        {/* Gebruikersprofiel */}
        <div className="p-4 border-t border-white/10">
          <Link
            href="/instellingen"
            className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/10 transition-colors group"
          >
            <div className="w-8 h-8 bg-everts-light rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {getInitials(profile.full_name)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white text-sm font-medium truncate">
                {profile.full_name}
              </div>
              <div className="text-white/50 text-xs">{getRolLabel(profile.role)}</div>
            </div>
            <ChevronRight className="w-4 h-4 text-white/30 group-hover:text-white/60 flex-shrink-0" />
          </Link>
        </div>
      </aside>

      {/* Mobiele bottom nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-everts-dark border-t border-white/10 z-50 flex">
        {visibleItems.slice(0, 5).map((item) => {
          const Icon = item.icon
          const isActive =
            item.href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname.startsWith(item.href)

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex-1 flex flex-col items-center gap-1 py-3 px-1 text-xs transition-colors',
                isActive ? 'text-everts-light' : 'text-white/40'
              )}
            >
              <Icon className="w-5 h-5" />
              <span className="leading-none">
                {item.label.split(' ')[0]}
              </span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}
