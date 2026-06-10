'use client'

import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { Bell, LogOut, User, Settings } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getInitials, getRolLabel } from '@/lib/utils'
import type { Profile } from '@/lib/types'

interface TopBarProps {
  profile: Profile
}

const ROUTE_LABELS: Array<[RegExp, string]> = [
  [/^\/dashboard$/, 'Dashboard'],
  [/^\/projecten\/nieuw$/, 'Projecten › Nieuw project'],
  [/^\/projecten\/[^/]+\/bewerken$/, 'Projecten › Project bewerken'],
  [/^\/projecten\/[^/]+\/rapportage$/, 'Projecten › Rapportage'],
  [/^\/projecten\/[^/]+\/geveldelen\/[^/]+\/locaties\/[^/]+$/, 'Projecten › Geveldeel › Locatie'],
  [/^\/projecten\/[^/]+\/geveldelen\/[^/]+$/, 'Projecten › Geveldeel'],
  [/^\/projecten\/[^/]+\/projectdelen\/[^/]+\/locaties\/[^/]+\/registraties\/[^/]+$/, 'Projecten › Locatie › Registratie'],
  [/^\/projecten\/[^/]+\/projectdelen\/[^/]+\/locaties\/[^/]+$/, 'Projecten › Projectdeel › Locatie'],
  [/^\/projecten\/[^/]+\/projectdelen\/[^/]+$/, 'Projecten › Projectdeel'],
  [/^\/projecten\/[^/]+$/, 'Projecten › Project'],
  [/^\/projecten$/, 'Projecten'],
  [/^\/rapportages$/, 'Rapportages'],
  [/^\/registraties\/nieuw$/, 'Registraties › Nieuw'],
  [/^\/registraties\/[^/]+$/, 'Registraties › Detail'],
  [/^\/registraties$/, 'Registraties'],
  [/^\/standaard-reparaties\/nieuw$/, 'Standaard reparaties › Nieuw'],
  [/^\/standaard-reparaties$/, 'Standaard reparaties'],
  [/^\/gebruikers$/, 'Gebruikers'],
  [/^\/instellingen$/, 'Instellingen'],
]

function getScreenNaam(pathname: string): string {
  for (const [pattern, label] of ROUTE_LABELS) {
    if (pattern.test(pathname)) return label
  }
  return pathname
}

export default function TopBar({ profile }: TopBarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [showMenu, setShowMenu] = useState(false)
  const screenNaam = getScreenNaam(pathname)

  const handleLogout = async () => {
    router.push('/login')
  }

  return (
    <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center justify-between flex-shrink-0">
      {/* Links: mobiel logo */}
      <div className="flex items-center lg:hidden">
        <img
          src="/logo-groen.svg"
          alt="Everts onderhoud & renovatie"
          className="h-7 w-auto"
        />
      </div>

      {/* Desktop: schermtitel */}
      <div className="hidden lg:block">
        <span className="text-sm font-medium text-slate-700">{screenNaam}</span>
      </div>

      {/* Rechts: acties */}
      <div className="flex items-center gap-2">
        {/* Notificaties (placeholder) */}
        <button className="relative p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
          <Bell className="w-5 h-5" />
        </button>

        {/* Gebruikersmenu */}
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <div className="w-8 h-8 bg-everts rounded-full flex items-center justify-center text-white text-xs font-bold">
              {getInitials(profile.full_name)}
            </div>
            <div className="hidden sm:block text-left">
              <div className="text-sm font-medium text-slate-800 leading-tight">
                {profile.full_name.split(' ')[0]}
              </div>
              <div className="text-xs text-slate-500">{getRolLabel(profile.role)}</div>
            </div>
          </button>

          {showMenu && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowMenu(false)}
              />
              <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-xl shadow-lg border border-slate-200 py-1 z-20">
                <div className="px-3 py-2 border-b border-slate-100">
                  <p className="text-sm font-medium text-slate-800">{profile.full_name}</p>
                  <p className="text-xs text-slate-500">{profile.email}</p>
                </div>

                <Link
                  href="/instellingen"
                  onClick={() => setShowMenu(false)}
                  className="flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <User className="w-4 h-4 text-slate-400" />
                  Mijn profiel
                </Link>
                <Link
                  href="/instellingen"
                  onClick={() => setShowMenu(false)}
                  className="flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <Settings className="w-4 h-4 text-slate-400" />
                  Instellingen
                </Link>

                <div className="border-t border-slate-100 mt-1 pt-1">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    Uitloggen
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
