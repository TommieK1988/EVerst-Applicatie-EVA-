/**
 * Feature-flags — schakelaars voor modules die nog niet in productie live mogen.
 *
 * Waarom een env-flag i.p.v. alleen rechten? Preview én productie delen dezelfde
 * Supabase; rechten staan dus in die gedeelde database. Een env-flag is de enige
 * betrouwbare "bestaat deze module in deze omgeving"-schakelaar:
 *   • aan  in Vercel Preview + lokaal (.env.local)  → zichtbaar/testbaar
 *   • uit  in Vercel Production                      → module is volledig afwezig,
 *                                                       óók na merge naar main.
 *
 * NEXT_PUBLIC_* wordt bij de build ingebakken, dus deze waarde is zowel in server-
 * als client-componenten beschikbaar.
 */
export const FEATURES = {
  /** Materieelbeheer (in ontwikkeling — verborgen tot go-live). */
  materieelbeheer: process.env.NEXT_PUBLIC_FEATURE_MATERIEEL === '1',
  /** Medewerkershandboek (in ontwikkeling — verborgen tot go-live). */
  handboek: process.env.NEXT_PUBLIC_FEATURE_HANDBOEK === '1',
  /**
   * Digitale prikklok. Anders dan de modules hierboven staat deze flag óók in Production aan:
   * inklokken is alleen op een echt werkadres te testen. Wie hem ziet, bepaalt de testerlijst in
   * `prikklok_instellingen` (zie lib/prikklok/auth.ts); deze flag is alleen de noodrem.
   */
  prikklok: process.env.NEXT_PUBLIC_FEATURE_PRIKKLOK === '1',
} as const

export type FeatureKey = keyof typeof FEATURES
