'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { meldFoutVanuitBrowser } from '@/lib/fouten/meld-client'

/**
 * Error-boundary voor het hele platform. Zonder deze viel elke sectie zonder eigen
 * error.tsx terug op de kale Next-productiefoutpagina — en werd de fout nergens gemeld.
 * De sidebar en topbar blijven staan, dus de gebruiker kan gewoon doorklikken.
 *
 * Secties met een eigen error.tsx (planning, wagenpark) gaan vóór deze.
 */
export default function PlatformError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const pathname = usePathname()

  useEffect(() => {
    meldFoutVanuitBrowser(error, pathname ?? 'platform')
  }, [error, pathname])

  return (
    <div className="max-w-2xl">
      <div className="bg-white rounded-lg border border-red-200 p-6">
        <h2 className="text-base font-semibold text-red-800">Er ging iets mis op deze pagina</h2>
        <p className="mt-2 text-sm text-slate-600">
          De fout is automatisch gemeld bij de beheerder — je hoeft niets door te geven.
          Probeer het opnieuw, of ga terug en klik opnieuw.
        </p>

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={reset}
            className="text-sm px-3 py-1.5 rounded-md bg-slate-800 text-white hover:bg-slate-700"
          >
            Opnieuw proberen
          </button>
        </div>

        {error.digest && (
          <p className="mt-4 text-xs text-slate-400">Foutcode: {error.digest}</p>
        )}
      </div>
    </div>
  )
}
