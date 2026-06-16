'use client'
import { useEffect } from 'react'

/**
 * Registreert de service worker (/sw.js) voor PWA-installeerbaarheid.
 * Alleen in productie — in development zou een SW de HMR/dev-flow hinderen.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

    const onLoad = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // stil falen — PWA-installatie is progressive enhancement
      })
    }
    window.addEventListener('load', onLoad)
    return () => window.removeEventListener('load', onLoad)
  }, [])

  return null
}
