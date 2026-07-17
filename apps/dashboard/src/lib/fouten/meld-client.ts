/**
 * Meldt een fout die in de BROWSER klapte aan /api/fouten/melden. Server-side fouten
 * lopen via instrumentation.ts en hoeven dit niet.
 *
 * Aanroepen vanuit een error-boundary (useEffect) — dus in een moment waarop er al iets
 * stuk is. De melding mag daarom nooit zelf gooien; falen is stil.
 */
export function meldFoutVanuitBrowser(
  error: Error & { digest?: string },
  bron: string,
): void {
  try {
    void fetch('/api/fouten/melden', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // keepalive: de melding moet ook aankomen als de gebruiker meteen wegnavigeert.
      keepalive: true,
      body: JSON.stringify({
        bron,
        melding: error?.message ?? 'Onbekende fout',
        fout_type: error?.name ?? null,
        stack: error?.stack ?? null,
        digest: error?.digest ?? null,
        url: typeof window !== 'undefined' ? window.location.pathname : null,
      }),
    }).catch(() => {})
  } catch {
    // Bewust leeg: een mislukte foutmelding mag de foutpagina niet ook nog slopen.
  }
}
