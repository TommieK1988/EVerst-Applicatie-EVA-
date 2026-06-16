'use client'
import React from 'react'
import { usePathname } from 'next/navigation'
import Sidebar from './Sidebar'
import TopBar  from './TopBar'
import MobileBottomNav from './MobileBottomNav'
import MobileRouteGuard from './MobileRouteGuard'
import { BreadcrumbProvider } from '@/lib/breadcrumb-context'
import { useIsMobile } from '@/lib/hooks/useMediaQuery'
import type { Tweaks } from './types'
import type { RechtenSet } from '@everts/database/platform-types'

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
  rechten?:          RechtenSet
}

export default function PlatformShell({ children, userName, userInitials, userSub, userFotoUrl, aantalOngelezen = 0, rechten }: Props) {
  const [tweaks,    setTweaks]    = React.useState<Tweaks>(TWEAK_DEFAULTS)
  const [collapsed, setCollapsed] = React.useState(true)
  const [hovering,  setHovering]  = React.useState(false)
  const [hydrated,  setHydrated]  = React.useState(false)
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false)

  const isMobile = useIsMobile()
  const pathname = usePathname()

  React.useEffect(() => {
    const saved = loadTweaks()
    setTweaks(saved)
    setCollapsed(saved.sidebarCollapsed ?? true)
    setHydrated(true)
  }, [])

  // Sluit de mobiele drawer bij elke navigatie (vangnet naast onNavigate).
  React.useEffect(() => { setMobileNavOpen(false) }, [pathname])

  // Voorkom achtergrond-scroll terwijl de drawer open is.
  React.useEffect(() => {
    if (!mobileNavOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [mobileNavOpen])

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
      {/* ── Desktop: sidebar in de flow, hover-to-expand ── */}
      {!isMobile && (
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
            rechten={rechten}
          />
        </div>
      )}

      {/* ── Mobiel: sidebar als off-canvas drawer + backdrop ── */}
      {isMobile && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setMobileNavOpen(false)}
            aria-hidden
            style={{
              position: 'fixed', inset: 0, zIndex: 50,
              background: 'rgba(0,0,0,0.45)',
              opacity: mobileNavOpen ? 1 : 0,
              pointerEvents: mobileNavOpen ? 'auto' : 'none',
              transition: 'opacity 0.2s ease',
            }}
          />
          {/* Slide-in paneel */}
          <div
            style={{
              position: 'fixed', top: 0, left: 0, zIndex: 51,
              height: '100dvh',
              transform: mobileNavOpen ? 'translateX(0)' : 'translateX(-100%)',
              transition: 'transform 0.24s cubic-bezier(0.4,0,0.2,1)',
              boxShadow: mobileNavOpen ? 'var(--shadow-xl)' : 'none',
            }}
          >
            <Sidebar
              density={tweaks.density}
              collapsed={false}
              drawer
              onNavigate={() => setMobileNavOpen(false)}
              onToggle={() => {}}
              userName={userName}
              userInitials={userInitials}
              userSub={userSub}
              userFotoUrl={userFotoUrl}
              rechten={rechten}
            />
          </div>
        </>
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        <TopBar
          dark={dark}
          setDark={setDark}
          aantalOngelezen={aantalOngelezen}
          onMenuClick={() => setMobileNavOpen(true)}
        />

        <main style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          // ruimte voor de mobiele bottom-nav
          paddingBottom: isMobile ? 'var(--bottomnav-h)' : undefined,
        }}>
          <MobileRouteGuard>{children}</MobileRouteGuard>
        </main>
      </div>

      {isMobile && <MobileBottomNav />}
    </div>
    </BreadcrumbProvider>
  )
}
