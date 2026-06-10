'use client'
import React from 'react'
import Sidebar from './Sidebar'
import TopBar  from './TopBar'
import { BreadcrumbProvider } from '@/lib/breadcrumb-context'
import type { Tweaks } from './types'

const TWEAK_DEFAULTS: Tweaks = {
  theme:               'light',
  density:             'default',
  sidebarCollapsed:    true,
  autoCollapseOnApps:  false,
}

function loadTweaks(): Tweaks {
  if (typeof window === 'undefined') return TWEAK_DEFAULTS
  try {
    const raw = localStorage.getItem('eva-tweaks')
    return raw ? { ...TWEAK_DEFAULTS, ...JSON.parse(raw) } : TWEAK_DEFAULTS
  } catch {
    return TWEAK_DEFAULTS
  }
}

type Props = {
  children:          React.ReactNode
  userName?:         string
  userInitials?:     string
  userSub?:          string
  userFotoUrl?:      string | null
  aantalOngelezen?:  number
}

export default function PlatformShell({ children, userName, userInitials, userSub, userFotoUrl, aantalOngelezen = 0 }: Props) {
  const [tweaks,    setTweaks]    = React.useState<Tweaks>(TWEAK_DEFAULTS)
  const [collapsed, setCollapsed] = React.useState(true)
  const [hovering,  setHovering]  = React.useState(false)
  const [hydrated,  setHydrated]  = React.useState(false)

  React.useEffect(() => {
    const saved = loadTweaks()
    setTweaks(saved)
    setCollapsed(saved.sidebarCollapsed ?? true)
    setHydrated(true)
  }, [])

  React.useEffect(() => {
    if (!hydrated) return
    localStorage.setItem('eva-tweaks', JSON.stringify({ ...tweaks, sidebarCollapsed: collapsed }))
  }, [tweaks, collapsed, hydrated])

  const dark = tweaks.theme === 'dark'

  function setDark(v: boolean) {
    setTweaks(t => ({ ...t, theme: v ? 'dark' : 'light' }))
  }

  const dataTheme = tweaks.theme !== 'light' ? tweaks.theme : undefined

  return (
    <BreadcrumbProvider>
    <div
      className="eva"
      data-theme={dataTheme}
      style={{
        display: 'flex',
        height: '100dvh',
        overflow: 'hidden',
        background: 'var(--bg)',
        fontFamily: 'var(--font-ui)',
        WebkitFontSmoothing: 'antialiased',
      }}
    >
      <div
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        style={{ display: 'flex' }}
      >
        <Sidebar
          density={tweaks.density}
          collapsed={collapsed && !hovering}
          onToggle={() => setCollapsed(c => !c)}
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
          userName={userName}
          userInitials={userInitials}
          userSub={userSub}
          userFotoUrl={userFotoUrl}
        />
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        <TopBar dark={dark} setDark={setDark} aantalOngelezen={aantalOngelezen} />

        <main style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
        }}>
          {children}
        </main>
      </div>
    </div>
    </BreadcrumbProvider>
  )
}
