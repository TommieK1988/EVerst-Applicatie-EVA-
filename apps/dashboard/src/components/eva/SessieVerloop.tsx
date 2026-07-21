'use client'
import React from 'react'
import { logout } from '@/app/(auth)/login/actions'
import {
  COOKIE_SESSIE_VERLOOPT,
  STORAGE_SESSIE_VERLOOPT,
  volgendeUitlogTijd,
} from '@/lib/sessie'

/**
 * Logt de gebruiker uit zodra het vervalmoment van de sessie is bereikt
 * (eind van de werkdag — zie `lib/sessie.ts`).
 *
 * - Er wordt géén timer meer gereset op input: gebruik verlengt de sessie niet.
 *   Wie 's ochtends inlogt, blijft de hele werkdag ingelogd en logt daarna één
 *   keer uit.
 * - Het vervalmoment staat in een cookie zodat `middleware.ts` het ook
 *   server-side afdwingt als de app tussendoor gesloten was.
 * - Cross-tab: alle tabs delen hetzelfde moment via `localStorage`.
 */
export default function SessieVerloop() {
  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let uitgelogd = false

    const doeUitloggen = () => {
      if (uitgelogd) return
      uitgelogd = true
      if (timer) clearTimeout(timer)
      // Vervalcookie opruimen zodat een verse login niet meteen weer uitlogt.
      document.cookie = `${COOKIE_SESSIE_VERLOOPT}=; Path=/; Max-Age=0; SameSite=Lax`
      try { localStorage.removeItem(STORAGE_SESSIE_VERLOOPT) } catch { /* geblokkeerd */ }
      logout().catch(() => { window.location.href = '/login' })
    }

    /** Bestaand vervalmoment gebruiken; anders er één bepalen en vastleggen. */
    const bepaalVerval = (): number => {
      const uitCookie = document.cookie
        .split('; ')
        .find(c => c.startsWith(`${COOKIE_SESSIE_VERLOOPT}=`))
        ?.split('=')[1]
      const ts = Number(uitCookie)
      if (Number.isFinite(ts) && ts > 0) return ts

      const nieuw = volgendeUitlogTijd()
      document.cookie = `${COOKIE_SESSIE_VERLOOPT}=${nieuw}; Path=/; SameSite=Lax`
      try { localStorage.setItem(STORAGE_SESSIE_VERLOOPT, String(nieuw)) } catch { /* geblokkeerd */ }
      return nieuw
    }

    const plan = () => {
      if (uitgelogd) return
      if (timer) clearTimeout(timer)
      const resterend = bepaalVerval() - Date.now()
      if (resterend <= 0) { doeUitloggen(); return }
      // setTimeout kapt af boven ~24,8 dagen; onze horizon is hooguit 24 uur.
      timer = setTimeout(doeUitloggen, resterend)
    }

    // Terug op de tab: telefoons bevriezen timers in de achtergrond, dus
    // hier opnieuw toetsen of het moment intussen verstreken is.
    const onVisibility = () => { if (document.visibilityState === 'visible') plan() }
    const onStorage = (e: StorageEvent) => { if (e.key === STORAGE_SESSIE_VERLOOPT) plan() }

    plan()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('storage', onStorage)

    return () => {
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  return null
}
