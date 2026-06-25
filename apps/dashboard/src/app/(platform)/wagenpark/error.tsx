'use client'

import { useEffect } from 'react'

/**
 * Error-boundary voor de hele Wagenpark-sectie.
 *
 * Vangt fouten af die optreden tijdens het renderen van wagenpark-pagina's —
 * meestal een databaseverbinding die niet lukt (ontbrekende of foute
 * DATABASE_URL). Toont dan een begrijpelijke melding i.p.v. de kale
 * productie-foutpagina. De data is niet weg; alleen de verbinding faalt.
 */
export default function WagenparkError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[wagenpark] render-fout:', error)
  }, [error])

  const lijktDbFout =
    /database|password|connection|DATABASE_URL|ECONNREFUSED|authentication/i.test(
      error.message,
    )

  return (
    <div className="max-w-2xl">
      <div className="bg-white rounded-lg border border-red-200 p-6">
        <h2 className="text-base font-semibold text-red-800">
          {lijktDbFout
            ? 'Geen verbinding met de database'
            : 'Er ging iets mis bij het laden'}
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          {lijktDbFout ? (
            <>
              De wagenpark-gegevens staan er nog wél, maar konden niet worden
              opgehaald. Dit komt vrijwel altijd door een ontbrekende of foute{' '}
              <code className="px-1 rounded bg-slate-100">DATABASE_URL</code> in
              deze omgeving.
            </>
          ) : (
            'Probeer het opnieuw. Blijft het misgaan, ga dan naar Diagnose.'
          )}
        </p>

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={reset}
            className="text-sm px-3 py-1.5 rounded-md bg-slate-800 text-white hover:bg-slate-700"
          >
            Opnieuw proberen
          </button>
          <a
            href="/wagenpark/diagnose"
            className="text-sm px-3 py-1.5 rounded-md border border-slate-300 hover:bg-slate-50"
          >
            Naar Diagnose
          </a>
        </div>

        {error.digest && (
          <p className="mt-4 text-xs text-slate-400">Foutcode: {error.digest}</p>
        )}
      </div>
    </div>
  )
}
