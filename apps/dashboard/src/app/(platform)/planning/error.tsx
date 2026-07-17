'use client'

import React from 'react'
import { meldFoutVanuitBrowser } from '@/lib/fouten/meld-client'

export default function PlanningError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  React.useEffect(() => {
    meldFoutVanuitBrowser(error, '/planning')
  }, [error])

  return (
    <div className="eva-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 320 }}>
      <div className="eva-card-warn" style={{ padding: '28px 32px', maxWidth: 420, textAlign: 'center' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600, color: 'var(--fg)', marginBottom: 8 }}>
          Planning kon niet worden geladen
        </div>
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg-muted)', marginBottom: 20 }}>
          {error.message}
        </div>
        <button onClick={reset} className="eva-btn-primary">
          Opnieuw proberen
        </button>
      </div>
    </div>
  )
}
