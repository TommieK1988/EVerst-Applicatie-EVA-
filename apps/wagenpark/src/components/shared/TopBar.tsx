'use client'

import { usePathname } from 'next/navigation'

const ROUTE_LABELS: Array<[RegExp, string]> = [
  [/^\/dashboard$/, 'Dashboard'],
  [/^\/voertuigen\/nieuw$/, 'Voertuigen › Nieuw voertuig'],
  [/^\/voertuigen\/[^/]+$/, 'Voertuigen › Detail'],
  [/^\/voertuigen$/, 'Voertuigen'],
  [/^\/bestuurders\/[^/]+$/, 'Bestuurders › Detail'],
  [/^\/bestuurders$/, 'Bestuurders'],
  [/^\/ritten\/import$/, 'Ritten › Importeren'],
  [/^\/ritten\/sync$/, 'Ritten › Synchroniseren'],
  [/^\/ritten$/, 'Ritten'],
  [/^\/parkeren\/import$/, 'Parkeren › Importeren'],
  [/^\/parkeren\/zones$/, 'Parkeren › Zones'],
  [/^\/parkeren$/, 'Parkeren'],
  [/^\/leasecontracten$/, 'Leasecontracten'],
  [/^\/diagnose$/, 'Diagnose'],
  [/^\/bevindingen$/, 'Bevindingen'],
  [/^\/instellingen$/, 'Instellingen'],
]

function getScreenNaam(pathname: string): string {
  for (const [pattern, label] of ROUTE_LABELS) {
    if (pattern.test(pathname)) return label
  }
  return pathname
}

export default function TopBar() {
  const pathname = usePathname()
  const screenNaam = getScreenNaam(pathname)

  return (
    <header className="bg-white border-b h-14 flex items-center px-4 lg:px-6 flex-shrink-0 gap-3">
      <span className="text-sm font-medium text-slate-800">{screenNaam}</span>
      <span className="text-slate-300 hidden lg:inline">·</span>
      <span className="text-sm text-slate-400 hidden lg:inline">Wagenpark</span>
    </header>
  )
}
