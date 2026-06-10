'use client'

import { Bell } from 'lucide-react'

interface Props {
  title?: string
  subtitle?: string
}

export function AppTopBar({ title, subtitle }: Props) {
  return (
    <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center justify-between flex-shrink-0">
      <div className="flex items-center gap-3 lg:hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-groen.svg" alt="Everts" className="h-7 w-auto" />
      </div>

      <div className="hidden lg:block">
        {title && (
          <div>
            <h1 className="text-lg font-semibold text-slate-800 leading-tight">{title}</h1>
            {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button className="relative p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
          <Bell className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 p-1.5 rounded-lg">
          <div className="w-8 h-8 bg-everts rounded-full flex items-center justify-center text-white text-xs font-bold">
            TK
          </div>
          <div className="hidden sm:block text-left">
            <div className="text-sm font-medium text-slate-800 leading-tight">Everts</div>
            <div className="text-xs text-slate-500">Admin</div>
          </div>
        </div>
      </div>
    </header>
  )
}
