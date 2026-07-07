'use client'
import React from 'react'
import { logout } from '@/app/(auth)/login/actions'
import {
  IDLE_MS,
  COOKIE_LAATSTE_ACTIVITEIT,
  STORAGE_LAATSTE_ACTIVITEIT,
} from '@/lib/idle'

/**
 * Logt de gebruiker automatisch uit na {@link IDLE_MS} zonder échte activiteit.
 *
 * - Alléén echte input (muis, toets, scroll, aanraking) reset de timer —
 *   achtergrond-fetches (notificatie-polling e.d.) verlengen de sessie niet.
 * - Activiteit wordt (throttled) naar een cookie geschreven zodat de
 *   `middleware.ts` het ook server-side kan afdwingen bij het openen van de URL.
 * - Cross-tab: activiteit in één tab reset via `localStorage` de timer in de
 *   andere tabs.
 * - Er is bewust géén waarschuwing: bij inactiviteit wordt direct uitgelogd.
 */
export default function IdleLogout() {
  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let uitgelogd = false
    let laatsteSchrijf = 0

    const doeUitloggen = () => {
      if (uitgelogd) return
      uitgelogd = true
      if (timer) clearTimeout(timer)
      // Activiteitscookie opruimen zodat een verse login niet meteen weer uitlogt.
      document.cookie = `${COOKIE_LAATSTE_ACTIVITEIT}=; Path=/; Max-Age=0; SameSite=Lax`
      logout().catch(() => {
        window.location.href = '/login'
      })
    }

    const resetTimer = () => {
      if (uitgelogd) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(doeUitloggen, IDLE_MS)
    }

    const registreerActiviteit = () => {
      if (uitgelogd) return
      resetTimer()
      const nu = Date.now()
      if (nu - laatsteSchrijf < 30_000) return // throttle: max 1×/30s schrijven
      laatsteSchrijf = nu
      document.cookie = `${COOKIE_LAATSTE_ACTIVITEIT}=${nu}; Path=/; SameSite=Lax`
      try {
        localStorage.setItem(STORAGE_LAATSTE_ACTIVITEIT, String(nu))
      } catch {
        /* localStorage kan geblokkeerd zijn — timer blijft lokaal werken */
      }
    }

    const onStorage = (e: StorageEvent) => {
      // Andere tab was actief → alleen onze eigen timer resetten (niet terugschrijven).
      if (e.key === STORAGE_LAATSTE_ACTIVITEIT) resetTimer()
    }

    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return
      // Terug op de tab: controleer of we tijdens afwezigheid al verlopen zijn.
      let ts = 0
      try {
        ts = Number(localStorage.getItem(STORAGE_LAATSTE_ACTIVITEIT) || 0)
      } catch {
        /* geen toegang → val terug op resetTimer */
      }
      if (ts && Date.now() - ts > IDLE_MS) doeUitloggen()
      else resetTimer()
    }

    const events: (keyof WindowEventMap)[] = ['mousedown', 'keydown', 'scroll', 'touchstart']
    events.forEach((ev) => window.addEventListener(ev, registreerActiviteit, { passive: true }))
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('storage', onStorage)

    registreerActiviteit() // seed direct bij mount

    return () => {
      if (timer) clearTimeout(timer)
      events.forEach((ev) => window.removeEventListener(ev, registreerActiviteit))
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  return null
}
