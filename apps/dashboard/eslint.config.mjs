import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FlatCompat } from '@eslint/eslintrc'

/**
 * ESLint-configuratie voor EVA.
 *
 * WAAROM FLAT CONFIG — `next lint` is per Next 15 afgeschaft en verdwijnt in Next 16. Erger nog:
 * er stond hier helemaal geen configuratiebestand, waardoor `next lint` bij elke run interactief
 * vroeg er een aan te maken. In een niet-interactieve omgeving (CI, `npm run lint`) liep dat vast
 * op een foutcode. Netto: er draaide maandenlang géén enkele lintcontrole op deze codebase.
 *
 * `eslint-config-next` kent nog geen flat-config-ingang, vandaar `FlatCompat` — dat vertaalt de
 * klassieke `extends` naar het nieuwe formaat. Zodra Next een flat variant levert kan die laag weg.
 */
const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) })

export default [
  {
    ignores: [
      'node_modules/**',
      // Buildoutput. `.next-*` vangt ook de losse dev-servers (.next-preview, .next-uren)
      // die naast de hoofdserver draaien met een eigen NEXT_DIST_DIR.
      '.next/**',
      '.next-*/**',
      'out/**',
      'public/**',
      // Door Next zelf gegenereerd en bij elke start herschreven.
      'next-env.d.ts',
      // Gegenereerde Supabase-types: die volgen het databaseschema, niet onze stijlregels.
      'src/lib/taken/supabase/database.types.ts',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),

  {
    rules: {
      /**
       * `any` is hier een bewuste keuze, geen slordigheid: de gegenereerde Supabase-types lopen
       * achter op het schema, dus de admin-client wordt overal als `any` gebruikt (zie de
       * `createAdminClient() as any`-regels met bijbehorende toelichting). Als error zou deze
       * regel 318 meldingen geven en de lint onbruikbaar maken als poort. Als waarschuwing blijft
       * hij zichtbaar voor nieuw werk zonder het bestaande te blokkeren.
       */
      '@typescript-eslint/no-explicit-any': 'warn',

      /**
       * Uit: onze UI-teksten zijn Nederlands en bevatten gewone aanhalingstekens en apostrofs
       * ("Altijd toestaan", collega's). Die renderen correct; ze vervangen door &quot;/&apos;
       * maakt de bron slechter leesbaar zonder dat er iets mee opgelost wordt.
       */
      'react/no-unescaped-entities': 'off',
    },
  },

  {
    // De buildconfiguratie is CommonJS en moet `require()` gebruiken.
    files: ['*.config.js', '*.config.mjs'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
]
