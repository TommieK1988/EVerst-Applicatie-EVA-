'use client'
import React from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'

/**
 * Pull-to-refresh voor mobiele lijst-schermen (/m): naar beneden trekken bovenaan
 * ververst de server-data (`router.refresh()`). Toont "Laatst ververst om HH:mm".
 *
 * Hangt aan de scroll-container van de MobielShell (`[data-m-scroll]`) — géén eigen
 * scroller. Mount dit als eerste kind ónder de AppHeader op een lijst-scherm.
 * NIET gebruiken op invoer-schermen (refresh kan invoer wissen).
 */
const DREMPEL = 70   // px trekken voordat verversen start
const MAX_PULL = 96  // visuele begrenzing

export default function MobielPullToRefresh() {
  const router = useRouter()
  const rootRef = React.useRef<HTMLDivElement>(null)
  const [pull, setPull] = React.useState(0)
  const [isPending, startTransition] = React.useTransition()
  const [laatst, setLaatst] = React.useState<Date | null>(null)

  // gesture-state in refs (geen re-render tijdens bewegen)
  const startY = React.useRef<number | null>(null)
  const actief = React.useRef(false)

  // Init tijd client-side (voorkomt hydration-mismatch).
  React.useEffect(() => { setLaatst(new Date()) }, [])

  // Zet de tijd zodra een refresh klaar is.
  const wasPending = React.useRef(false)
  React.useEffect(() => {
    if (wasPending.current && !isPending) {
      setLaatst(new Date())
      setPull(0)
    }
    wasPending.current = isPending
  }, [isPending])

  React.useEffect(() => {
    const scroller = rootRef.current?.closest('[data-m-scroll]') as HTMLElement | null
    if (!scroller) return

    const onStart = (e: TouchEvent) => {
      if (scroller.scrollTop <= 0 && !isPending) {
        startY.current = e.touches[0].clientY
        actief.current = true
      }
    }
    const onMove = (e: TouchEvent) => {
      if (!actief.current || startY.current === null) return
      const delta = e.touches[0].clientY - startY.current
      if (delta <= 0 || scroller.scrollTop > 0) { setPull(0); return }
      setPull(Math.min(delta * 0.5, MAX_PULL))
    }
    const onEnd = () => {
      if (!actief.current) return
      actief.current = false
      startY.current = null
      setPull(prev => {
        if (prev >= DREMPEL && !isPending) startTransition(() => router.refresh())
        return prev >= DREMPEL ? DREMPEL / 2 : 0
      })
    }

    scroller.addEventListener('touchstart', onStart, { passive: true })
    scroller.addEventListener('touchmove', onMove, { passive: true })
    scroller.addEventListener('touchend', onEnd, { passive: true })
    scroller.addEventListener('touchcancel', onEnd, { passive: true })
    return () => {
      scroller.removeEventListener('touchstart', onStart)
      scroller.removeEventListener('touchmove', onMove)
      scroller.removeEventListener('touchend', onEnd)
      scroller.removeEventListener('touchcancel', onEnd)
    }
  }, [isPending, router])

  const verversen = isPending
  const hoogte = verversen ? 40 : pull
  const label = verversen
    ? 'Verversen…'
    : pull >= DREMPEL ? 'Loslaten om te verversen' : 'Trek om te verversen'

  return (
    <div ref={rootRef}>
      {/* Trek-/spinner-indicator */}
      <div
        style={{
          height: hoogte,
          overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          transition: actief.current ? 'none' : 'height 0.2s ease',
          color: '#6b757c', fontSize: 12, fontWeight: 600,
        }}
      >
        {hoogte > 16 && (
          <>
            <span
              style={{
                width: 16, height: 16, borderRadius: '50%',
                border: '2px solid #d7dde0', borderTopColor: '#009439',
                display: 'inline-block', flexShrink: 0,
                animation: verversen ? 'm-spin 0.7s linear infinite' : 'none',
                transform: verversen ? undefined : `rotate(${Math.min(pull / MAX_PULL, 1) * 270}deg)`,
              }}
            />
            {label}
          </>
        )}
      </div>

      {/* Laatst-ververst-balkje */}
      <div style={{
        textAlign: 'center', fontSize: 11, color: '#9aa4ab', fontWeight: 500,
        padding: '2px 0 6px',
      }}>
        {laatst ? `Laatst ververst om ${format(laatst, 'HH:mm')}` : ' '}
      </div>

      <style>{`@keyframes m-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
