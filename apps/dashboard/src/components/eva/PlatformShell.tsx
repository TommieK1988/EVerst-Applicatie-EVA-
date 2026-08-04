'use client'
import React from 'react'
import Sidebar from './Sidebar'
import TopBar  from './TopBar'
import SessieVerloop from './SessieVerloop'
import NotificatieToasts from './NotificatieToasts'
import UpdatesPopup from './UpdatesPopup'
import { GlobalSearchProvider } from './GlobalSearch'
import { BreadcrumbProvider } from '@/lib/breadcrumb-context'
import type { Tweaks } from './types'
import type { RechtenSet } from '@everts/database/platform-types'
import type { Notificatie } from '@/app/(platform)/notificaties/actions'
import type { ChangelogItem } from '@/app/(platform)/wat-is-nieuw/actions'

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
  children:              React.ReactNode
  userName?:             string
  userInitials?:         string
  userSub?:              string
  userFotoUrl?:          string | null
  aantalOngelezen?:      number
  ongelezenNotificaties?: Notificatie[]
  aantalNieuweUpdates?:  number
  nieuweUpdates?:        ChangelogItem[]
  rechten?:              RechtenSet
}

export default function PlatformShell({ children, userName, userInitials, userSub, userFotoUrl, aantalOngelezen = 0, ongelezenNotificaties = [], aantalNieuweUpdates = 0, nieuweUpdates = [], rechten }: Props) {
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

  // Het thema hoort óók op <html>: de <body>, de scrollbars en alles wat via
  // een portal buiten deze div rendert (Radix-dialogs, popovers, toasts) zitten
  // niet in deze boom en bleven anders licht.
  React.useEffect(() => {
    if (!hydrated) return
    const root = document.documentElement
    if (tweaks.theme === 'light') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', tweaks.theme)
  }, [tweaks.theme, hydrated])

  const dark = tweaks.theme === 'dark'

  function setDark(v: boolean) {
    setTweaks(t => ({ ...t, theme: v ? 'dark' : 'light' }))
  }

  const dataTheme = tweaks.theme !== 'light' ? tweaks.theme : undefined

  return (
    <BreadcrumbProvider>
    <GlobalSearchProvider>
    <SessieVerloop />
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
        onMouseLeave={() => setHovering(false)}
        style={{ display: 'flex' }}
      >
        <Sidebar
          density={tweaks.density}
          collapsed={collapsed && !hovering}
          pinned={!collapsed}
          onToggle={() => setCollapsed(c => !c)}
          onIconEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
          userName={userName}
          userInitials={userInitials}
          userSub={userSub}
          userFotoUrl={userFotoUrl}
          rechten={rechten}
        />
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        <TopBar dark={dark} setDark={setDark} aantalOngelezen={aantalOngelezen} aantalNieuweUpdates={aantalNieuweUpdates} />

        <main style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
        }}>
          {children}
        </main>
      </div>

      <NotificatieToasts notificaties={ongelezenNotificaties} />
      <UpdatesPopup updates={nieuweUpdates} totaal={aantalNieuweUpdates} />
    </div>
    </GlobalSearchProvider>
    </BreadcrumbProvider>
  )
}
