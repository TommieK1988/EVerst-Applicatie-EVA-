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
} as const

export type FeatureKey = keyof typeof FEATURES
