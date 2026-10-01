/**
 * Lege vervanger voor `server-only` in tests.
 *
 * Next.js levert dat pakket zelf mee (onder `next/dist/compiled`) en zet het alleen in de
 * server-bundel om naar een lege module. Vitest kent die omleiding niet: daar bestaat
 * `server-only` niet als los pakket, dus elke test die iets uit een server-module
 * importeert, klapt al bij het laden. Zie de alias in `vitest.config.mts`.
 */
export {}
