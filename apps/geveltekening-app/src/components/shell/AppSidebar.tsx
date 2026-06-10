'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Building2, Settings, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface NavItem {
  href: string
  label: string
  icon: React.ElementType
}

const navItems: NavItem[] = [
  { href: '/', label: 'Tekeningen', icon: Building2 },
  { href: '/instellingen', label: 'Instellingen', icon: Settings },
]

export function AppSidebar() {
  const pathname = usePathname()

  return (
    <>
      <aside className="hidden lg:flex w-64 bg-everts-dark flex-col flex-shrink-0">
        <div className="p-5 border-b border-white/10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-wit.svg" alt="Everts" className="h-9 w-auto" />
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
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
              </Link>
            )
          })}
        </nav>

        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-3 p-2 rounded-lg group">
            <div className="w-8 h-8 bg-everts-light rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              TK
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white text-sm font-medium truncate">Everts</div>
              <div className="text-white/50 text-xs">Geveltekening</div>
            </div>
            <ChevronRight className="w-4 h-4 text-white/30" />
          </div>
        </div>
      </aside>

      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-everts-dark border-t border-white/10 z-50 flex">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
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
              <span className="leading-none">{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}
