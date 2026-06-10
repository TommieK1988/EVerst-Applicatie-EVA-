'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Car,
  Users,
  Route,
  ParkingCircle,
  AlertTriangle,
  FileText,
  Settings,
  ExternalLink,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type NavItem = { href: string; label: string; icon: React.ElementType }

const navItems: NavItem[] = [
  { href: '/dashboard',        label: 'Dashboard',       icon: LayoutDashboard },
  { href: '/voertuigen',       label: 'Voertuigen',      icon: Car },
  { href: '/bestuurders',      label: 'Bestuurders',     icon: Users },
  { href: '/ritten',           label: 'Ritten',          icon: Route },
  { href: '/parkeren',         label: 'Parkeren',        icon: ParkingCircle },
  { href: '/bevindingen',      label: 'Bevindingen',     icon: AlertTriangle },
  { href: '/leasecontracten',  label: 'Leasecontracten', icon: FileText },
  { href: '/instellingen',     label: 'Instellingen',    icon: Settings },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="hidden lg:flex w-60 bg-slate-900 flex-col flex-shrink-0">
      <div className="p-5 border-b border-white/10">
        <div className="flex items-center gap-2 text-white font-semibold">
          <Car className="w-5 h-5" />
          <span>Wagenpark</span>
        </div>
        <div className="text-xs text-white/40 mt-1">Everts Platform</div>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                isActive
                  ? 'bg-green-600 text-white'
                  : 'text-white/70 hover:bg-white/10 hover:text-white'
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="p-3 border-t border-white/10">
        <a
          href="http://localhost:3000"
          className="flex items-center gap-2 px-3 py-2 rounded-md text-xs text-white/50 hover:text-white hover:bg-white/10 transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Platform-overzicht
        </a>
      </div>
    </aside>
  )
}
