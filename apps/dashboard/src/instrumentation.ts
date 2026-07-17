import type { Instrumentation } from 'next'

/**
 * Vangnet voor élke onafgevangen serverfout: Server Components, route handlers,
 * server actions, middleware en de cron-routes. Next roept deze hook aan vlak
 * voordat de fout een 500 wordt, dus we hoeven nergens anders iets te instrumenteren.
 *
 * Wat hier NIET langskomt: fouten die code zelf al afvangt. De ~780 plekken met het
 * `{ ok: false, error }`-patroon blijven dus onzichtbaar in de log — die zijn
 * afgehandeld. Is zo'n geval tóch een incident, roep dan logFout() daar handmatig aan.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  // Dynamisch importeren: instrumentation.ts wordt ook in de edge-runtime geladen, en
  // log.ts trekt node:crypto + de Supabase-adminclient mee.
  const { logFout, foutNaarInvoer, isVerwachteFout } = await import('./lib/fouten/log')

  if (isVerwachteFout(err)) return

  const pad = request.path ?? ''
  await logFout(
    foutNaarInvoer(err, {
      omgeving: pad.startsWith('/api/cron') ? 'cron' : 'server',
      bron: context.routePath || pad || 'onbekend',
      soort: context.routeType,
      url: pad,
      extra: {
        method: request.method,
        routerKind: context.routerKind,
        ...(context.revalidateReason ? { revalidateReason: context.revalidateReason } : {}),
      },
    }),
  )
}
