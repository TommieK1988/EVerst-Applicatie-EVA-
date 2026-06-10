'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useRef, useState, useEffect } from 'react'
import { FolderOpen, BookOpen, BarChart3, Settings, Bell, HelpCircle, ChevronDown } from 'lucide-react'
import { cn, getInitials } from '@/lib/utils'

interface SubItem {
  href: string
  label: string
}

interface NavItem {
  href: string
  label: string
  icon: React.ElementType
  subItems?: SubItem[]
}

const SCREEN_NAMEN: Array<[RegExp, string]> = [
  [/^\/instellingen\/offertes\/layouts\/[^/]+$/, 'Instellingen › Offerte layouts › Editor'],
  [/^\/instellingen\/offertes\/layouts$/, 'Instellingen › Offerte layouts'],
  [/^\/instellingen\/offertes$/, 'Instellingen › Offertes'],
  [/^\/instellingen$/, 'Instellingen'],
  [/^\/quotes\/new$/, 'Offertes › Nieuwe offerte'],
  [/^\/quotes\/[^/]+\/preview$/, 'Offertes › Preview'],
  [/^\/quotes\/[^/]+$/, 'Offertes › Details'],
  [/^\/quotes$/, 'Offertes'],
  [/^\/bibliotheek\/recepten$/, 'Bibliotheek › Recepten'],
  [/^\/bibliotheek\/schilderwerk$/, 'Bibliotheek › Schilderwerk'],
  [/^\/bibliotheek\/materialen$/, 'Bibliotheek › Materialen'],
  [/^\/bibliotheek\/behandelingen$/, 'Bibliotheek › Behandelingen'],
  [/^\/bibliotheek$/, 'Bibliotheek'],
  [/^\/rapportages$/, 'Rapportages'],
  [/^\/projecten\/nieuw$/, 'Projecten › Nieuw project'],
  [/^\/projecten\/[^/]+\/calculatie$/, 'Projecten › Calculatie'],
  [/^\/projecten\/[^/]+\/meetstaat$/, 'Projecten › Meetstaat'],
  [/^\/projecten\/[^/]+\/werkbegroting\/afdruk$/, 'Projecten › Werkbegroting › Afdruk'],
  [/^\/projecten\/[^/]+\/werkbegroting$/, 'Projecten › Werkbegroting'],
  [/^\/projecten\/[^/]+\/bewerken$/, 'Projecten › Bewerken'],
  [/^\/projecten\/[^/]+$/, 'Projecten › Project'],
  [/^\/projecten$/, 'Projecten'],
]

/** Zet een URL-pad om naar een leesbare scherm-naam */
function getScreenNaam(pathname: string): string {
  for (const [pattern, label] of SCREEN_NAMEN) {
    if (pattern.test(pathname)) return label
  }
  return ''
}

const navItems: NavItem[] = [
  { href: '/projecten', label: 'Projecten', icon: FolderOpen },
  {
    href: '/bibliotheek',
    label: 'Bibliotheek',
    icon: BookOpen,
    subItems: [
      { href: '/bibliotheek/recepten', label: 'Recepten' },
      { href: '/bibliotheek/schilderwerk', label: 'Schilderwerk' },
      { href: '/bibliotheek/materialen', label: 'Materialen' },
    ],
  },
  { href: '/rapportages', label: 'Rapportages', icon: BarChart3 },
  { href: '/instellingen', label: 'Instellingen', icon: Settings },
]

const gebruiker = { naam: 'Kees Everts', rol: 'Calculator' }

function DropdownNavItem({ item, pathname }: { item: NavItem; pathname: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const isActive = pathname.startsWith(item.href)
  const Icon = item.icon

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className={cn(
          'flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-all mx-0.5',
          isActive
            ? 'bg-everts text-white shadow-sm'
            : 'text-white/60 hover:bg-white/10 hover:text-white'
        )}
      >
        <Icon className="w-4 h-4 flex-shrink-0" />
        <span className="hidden md:inline">{item.label}</span>
        <ChevronDown className={cn('w-3.5 h-3.5 hidden md:inline transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-44 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-50">
          {item.subItems!.map(sub => {
            const subActive = pathname.startsWith(sub.href)
            return (
              <Link
                key={sub.href}
                href={sub.href}
                onClick={() => setOpen(false)}
                className={cn(
                  'block px-4 py-2 text-sm transition-colors',
                  subActive
                    ? 'bg-everts/10 text-everts font-medium'
                    : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                )}
              >
                {sub.label}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function TopBar() {
  const pathname = usePathname()
  const screenNaam = getScreenNaam(pathname)

  return (
    <>
      <header className="h-14 bg-everts-dark flex items-center flex-shrink-0 shadow-md z-40 relative">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-5 border-r border-white/10 h-full flex-shrink-0">
          <img src="/logo-beeldmerk.svg" alt="Everts" className="h-7 w-auto" />
          <div className="hidden sm:block">
            <div className="text-white text-sm font-bold leading-tight">EvertsCalc</div>
            <div className="text-white/50 text-xs leading-tight">Calculatiesoftware</div>
          </div>
        </div>

        {/* Navigatie */}
        <nav className="flex items-center h-full flex-1 px-3">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = pathname.startsWith(item.href)

            if (item.subItems) {
              return <DropdownNavItem key={item.href} item={item} pathname={pathname} />
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-all mx-0.5',
                  isActive
                    ? 'bg-everts text-white shadow-sm'
                    : 'text-white/60 hover:bg-white/10 hover:text-white'
                )}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className="hidden md:inline">{item.label}</span>
              </Link>
            )
          })}
        </nav>

        {/* Screennaam — gecentreerd */}
        {screenNaam && (
          <div className="hidden lg:flex absolute left-1/2 -translate-x-1/2 items-center pointer-events-none">
            <span className="text-white/70 text-sm font-medium tracking-wide">{screenNaam}</span>
          </div>
        )}

        {/* Rechts: acties + avatar */}
        <div className="flex items-center gap-1 px-4 flex-shrink-0">
          <button className="p-2 text-white/50 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
            <HelpCircle className="w-4 h-4" />
          </button>
          <button className="p-2 text-white/50 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
            <Bell className="w-4 h-4" />
          </button>
          <Link
            href="/instellingen"
            className="w-8 h-8 bg-everts-light rounded-full flex items-center justify-center text-white text-xs font-bold ml-1 hover:opacity-90 transition-opacity"
          >
            {getInitials(gebruiker.naam)}
          </Link>
        </div>
      </header>

      {/* Mobiele bottom nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-everts-dark border-t border-white/10 z-50 flex">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname.startsWith(item.href)
          const firstSub = item.subItems?.[0]?.href ?? item.href
          return (
            <Link
              key={item.href}
              href={firstSub}
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
