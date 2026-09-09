import { fileURLToPath } from 'node:url'

/**
 * Testopzet voor EVA.
 *
 * Bewust minimaal. De eerste tests dekken de rekenkern (`src/lib/everts-calc/calculations.ts`
 * en verwanten), en die is puur: geen database, geen React, geen netwerk. Daar is dus geen
 * jsdom, geen setup-bestand en geen mocking-laag voor nodig. Zodra er een test bijkomt die
 * een component rendert hoort daar een aparte omgeving bij -- niet hier globaal aanzetten,
 * want dat maakt de snelle tests traag.
 *
 * WAAROM GEEN `defineConfig` UIT 'vitest/config': dat is een identiteitsfunctie die alleen
 * typehulp geeft, maar hij dwingt af dat vitest al geïnstalleerd is voordat de config
 * geladen kan worden. Met een kaal object draait `npx vitest` ook in een werkboom waar de
 * afhankelijkheden nog niet staan. Scheelt een kip-en-ei bij het opzetten.
 */
export default {
  resolve: {
    alias: {
      // Spiegelt `paths` uit tsconfig.json: '@/*' -> './src/*'
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
}
