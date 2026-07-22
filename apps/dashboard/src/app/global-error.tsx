'use client'

import { useEffect } from 'react'
import { meldFoutVanuitBrowser } from '@/lib/fouten/meld-client'

/**
 * Laatste vangnet: fouten in de root-layout zelf. Vervangt de hele pagina, dus deze
 * component rendert zijn eigen <html>/<body> en mag niets uit de layout aannemen —
 * ook geen globals.css. Vandaar de inline stijlen.
 *
 * Let op: Next gebruikt global-error alleen in een productiebuild. In `next dev` zie je
 * de foutoverlay; test dit dus met `npm run build && npm run start`.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    meldFoutVanuitBrowser(error, 'app/global-error')
  }, [error])

  return (
    <html lang="nl">
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, sans-serif', background: '#f8fafc' }}>
        <div style={{ maxWidth: 480, margin: '15vh auto', padding: '0 24px' }}>
          <div style={{ background: 'var(--bg-elev)', border: '1px solid #fecaca', borderRadius: 12, padding: 28 }}>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#991b1b' }}>
              EVA kon deze pagina niet laden
            </h1>
            <p style={{ marginTop: 10, fontSize: 14, lineHeight: 1.6, color: '#475569' }}>
              Er ging iets mis waar we niet omheen konden. De fout is automatisch gemeld —
              je hoeft niets door te geven. Probeer het opnieuw; blijft het misgaan, geef dan
              de foutcode hieronder door.
            </p>
            <button
              onClick={reset}
              style={{
                marginTop: 18, padding: '8px 14px', fontSize: 14, cursor: 'pointer',
                borderRadius: 6, border: 0, background: '#1e293b', color: '#fff',
              }}
            >
              Opnieuw proberen
            </button>
            {error.digest && (
              <p style={{ marginTop: 18, fontSize: 12, color: '#94a3b8' }}>Foutcode: {error.digest}</p>
            )}
          </div>
        </div>
      </body>
    </html>
  )
}
